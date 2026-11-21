// Разова міграція секретів і приватних полів з публічного users/<нік>.
//
//   node scripts/migrate-secrets.js                     — dry-run: лише звіт, нічого не пише
//   node scripts/migrate-secrets.js --apply             — переносить і чистить
//   … --key ./service-account.json                      — ключ сервісного акаунта з файлу
//                                                         (або env FIREBASE_SERVICE_ACCOUNT_KEY)
//   … --only nick1,nick2                                — лише ці гравці (перевірка на кількох)
//
// Ходить у базу з правами сервісного акаунта (той самий REST-клієнт, що й
// api/*, lib/firebase.js — правила бази його не стосуються). Без firebase-admin,
// як і решта серверного коду. З FIREBASE_DATABASE_EMULATOR_HOST — у локальний
// емулятор (так його й перевірено, scripts/selfcheck-migrate-secrets.js).
//
// Що робить для кожного users/<нік>:
//   pass, securityAnswerHash → user_secrets/<нік>/… у форматі PBKDF2 (password.js):
//     • pbkdf2$…                 — як є;
//     • голий SHA-256 (64 hex)   — обгортається: pbkdf2sha$… = PBKDF2(SHA-256) — пароль не потрібен;
//     • відкритий текст          — хешується одразу (hash(текст));
//     • securityAnswer (відкрита відповідь, дуже старі акаунти) → securityAnswerHash, якщо його нема.
//     Старе місце має пріоритет над user_secrets — так само, як lib/secrets.js getSecret
//     (туди ще писали старі шляхи адмінки/бота).
//   birthDate                 → user_secrets/<нік>/birthDate
//   email, lastIpHash, telegramChatId → user_private/<нік>/… (наявне нове значення не затирається)
//   securityLog               → user_private/<нік>/securityLog (злиття за ключами)
//   lastIP                    → видаляється (відкриті IP більше не зберігаємо)
// Після цього всі ці поля в users/<нік> видаляються.
// Якщо формат хешу не розпізнано (не рядок тощо) — поле не чіпається, а гравець
// потрапляє в список needsReset (user_secrets/<нік>/needsReset = true з --apply).
//
// Секрети у звіт не виводяться — лише ніки й категорії.

const path = require("path");
const fs = require("fs");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}
const APPLY = process.argv.includes("--apply");
const keyFile = arg("--key");
if (keyFile) process.env.FIREBASE_SERVICE_ACCOUNT_KEY = fs.readFileSync(path.resolve(keyFile), "utf8");
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);

const { dbGet, dbKeys, dbUpdate } = require("../lib/firebase");
const { getServiceAccount } = require("../lib/google-auth");
const { EMULATOR } = require("../lib/emulator");
const SlotOKPassword = require("../password.js");
const { outputs } = require("./build-rules.js");

const SECRET_HASHES = ["pass", "securityAnswerHash"];
const PRIVATE = ["email", "lastIpHash", "telegramChatId"];
const LEGACY_FIELDS = [...SECRET_HASHES, "securityAnswer", "birthDate", ...PRIVATE, "lastIP", "securityLog"];

// → { value, kind } | null (не розпізнано)
async function upgradeHash(stored) {
  if (typeof stored !== "string" || !stored) return null;
  if (stored.startsWith("pbkdf2$") || stored.startsWith("pbkdf2sha$")) return { value: stored, kind: "pbkdf2" };
  if (/^[0-9a-f]{64}$/i.test(stored)) return { value: await SlotOKPassword.wrapSha256(stored), kind: "sha256" };
  return { value: await SlotOKPassword.hash(stored), kind: "plaintext" };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function migrateUser(nick, stats) {
  const legacy = {};
  await Promise.all(LEGACY_FIELDS.map(async (f) => { legacy[f] = await dbGet(`users/${nick}/${f}`); }));
  const present = LEGACY_FIELDS.filter((f) => legacy[f] !== null && legacy[f] !== undefined);
  if (!present.length) return;
  stats.users++;
  const updates = {};
  const clear = (f) => { updates[`users/${nick}/${f}`] = null; };

  if (legacy.securityAnswer != null && legacy.securityAnswerHash == null) {
    legacy.securityAnswerHash = String(legacy.securityAnswer).trim().toLowerCase();
  }
  for (const f of SECRET_HASHES) {
    if (legacy[f] == null) continue;
    const up = await upgradeHash(legacy[f]);
    if (!up) { stats.needsReset.add(nick); continue; }
    stats[`${f}:${up.kind}`] = (stats[`${f}:${up.kind}`] || 0) + 1;
    updates[`user_secrets/${nick}/${f}`] = up.value;
    clear(f);
  }
  if (legacy.securityAnswer != null) clear("securityAnswer");
  if (legacy.birthDate != null) {
    if ((await dbGet(`user_secrets/${nick}/birthDate`)) == null) updates[`user_secrets/${nick}/birthDate`] = legacy.birthDate;
    clear("birthDate");
    stats.birthDate++;
  }
  for (const f of PRIVATE) {
    if (legacy[f] == null) continue;
    if (legacy[f] !== "" && (await dbGet(`user_private/${nick}/${f}`)) == null) updates[`user_private/${nick}/${f}`] = legacy[f];
    clear(f);
    stats[f] = (stats[f] || 0) + 1;
  }
  if (legacy.lastIP != null) { clear("lastIP"); stats.lastIP++; }
  if (legacy.securityLog && typeof legacy.securityLog === "object") {
    for (const [k, e] of Object.entries(legacy.securityLog)) {
      if (!e || typeof e !== "object") continue;
      updates[`user_private/${nick}/securityLog/${k}`] = {
        type: String(e.type || "event").replace(/[<>"'`]/g, "").slice(0, 32),
        details: String(e.details || "").slice(0, 200),
        ts: Number(e.ts) || 0,
        ...(e.ua ? { ua: String(e.ua).slice(0, 120) } : {}),
      };
    }
    stats.securityLog++;
  }
  if (legacy.securityLog != null) clear("securityLog");
  if (stats.needsReset.has(nick)) updates[`user_secrets/${nick}/needsReset`] = true;

  if (APPLY && Object.keys(updates).length) await dbUpdate("", updates);
}

// Верхні вузли бази, яких немає в правилах: їх правила й так закривають
// (корінь .read/.write = false), але це кандидати на ручну перевірку/видалення.
async function unknownTopNodes() {
  const known = new Set(Object.keys(outputs["database.rules.json"].rules).filter((k) => !k.startsWith(".")));
  // Вузли, які пише лише сервер і тому не мають правил.
  ["room_state", "room_of", "room_paid", "live_open", "live_paid", "league_done"].forEach((k) => known.add(k));
  return (await dbKeys("")).filter((k) => !known.has(k));
}

(async () => {
  if (!getServiceAccount()) {
    console.error("Немає ключа сервісного акаунта: --key ./service-account.json або env FIREBASE_SERVICE_ACCOUNT_KEY");
    process.exit(2);
  }
  console.log(`${APPLY ? "APPLY" : "DRY-RUN (нічого не пишу; для запису --apply)"} — ${EMULATOR ? "ЕМУЛЯТОР" : "ПРОДОВА БАЗА"}`);
  const nicks = ONLY.length ? ONLY : await dbKeys("users");
  const stats = { users: 0, birthDate: 0, lastIP: 0, securityLog: 0, needsReset: new Set() };
  let done = 0;
  await pool(nicks, 8, async (nick) => {
    try { await migrateUser(nick, stats); } catch (e) { console.error(`  ${nick}: ${e.message}`); stats.errors = (stats.errors || 0) + 1; }
    if (++done % 200 === 0) console.log(`  … ${done}/${nicks.length}`);
  });
  const { needsReset, ...rest } = stats;
  console.log(`Гравців перевірено: ${nicks.length}; з полями для переносу: ${rest.users}`);
  for (const [k, v] of Object.entries(rest)) if (k !== "users") console.log(`  ${k}: ${v}`);
  console.log(`needsReset (хеш не розпізнано, потрібне скидання пароля адміном): ${needsReset.size}${needsReset.size ? " → " + [...needsReset].join(", ") : ""}`);
  try {
    const unknown = await unknownTopNodes();
    console.log(`Верхні вузли бази, яких немає в правилах (перевірити вручну): ${unknown.length ? unknown.join(", ") : "немає"}`);
  } catch (e) { console.warn("Не вдалося отримати список вузлів:", e.message); }
  if (!APPLY) console.log("Це був dry-run. Для запису: node scripts/migrate-secrets.js --apply");
  if (stats.errors) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
