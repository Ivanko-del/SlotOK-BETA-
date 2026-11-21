// Self-check міграції секретів: node scripts/selfcheck-migrate-secrets.js
//
// Піднімає емулятор Realtime Database, кладе в users/ старі формати
// (pbkdf2, голий SHA-256, відкритий пароль, відкрита відповідь, IP, email,
// журнал безпеки), запускає scripts/migrate-secrets.js спершу в dry-run
// (нічого не має змінитись), потім з --apply — і перевіряє, що все переїхало,
// старі паролі досі підходять, а в users/ не лишилось жодного секрету.
// Без jar емулятора — SKIP (як і selfcheck-db-rules.js).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const SlotOKPassword = require("../password.js");

const ROOT = path.join(__dirname, "..");
const PORT = 9124;
const NS = "nye-slotok-default-rtdb"; // те саме, що lib/emulator.js
const BASE = `http://127.0.0.1:${PORT}`;

function findJar() {
  if (process.env.FIREBASE_DB_EMULATOR_JAR) return process.env.FIREBASE_DB_EMULATOR_JAR;
  const dir = path.join(os.homedir(), ".cache", "firebase", "emulators");
  if (!fs.existsSync(dir)) return null;
  const jar = fs.readdirSync(dir).filter((f) => /^firebase-database-emulator.*\.jar$/.test(f)).sort().pop();
  return jar ? path.join(dir, jar) : null;
}

const req = async (method, p, body) => {
  const res = await fetch(`${BASE}/${p}.json?ns=${NS}`, {
    method, headers: { Authorization: "Bearer owner" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(res.ok, `${method} ${p}: HTTP ${res.status}`);
  return res.json();
};

function runMigration(...args) {
  return execFileSync(process.execPath, [path.join(ROOT, "scripts/migrate-secrets.js"), ...args], {
    env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: `127.0.0.1:${PORT}`, VERCEL: "" },
    encoding: "utf8",
  });
}

(async () => {
  const jar = findJar();
  if (!jar) { console.log("SKIP — емулятор бази не знайдено (npx firebase-tools setup:emulators:database)"); return; }
  const proc = spawn("java", ["-jar", jar, "--port", String(PORT)], { stdio: "ignore" });
  try {
    for (let i = 0; ; i++) {
      try { await fetch(`${BASE}/.json?ns=ping`); break; } catch {
        if (i > 60) throw new Error("емулятор не стартував");
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const modern = await SlotOKPassword.hash("modern-pass");
    const sha = await SlotOKPassword.sha256Hex("sha-pass");
    const shaAnswer = await SlotOKPassword.sha256Hex("київ");
    await req("PUT", "", {
      users: {
        modern: { balance: 1, pass: modern, birthDate: "2001-02-03", email: "m@x.ua", lastIP: "1.2.3.4" },
        oldsha: { balance: 2, pass: sha, securityAnswerHash: shaAnswer, lastIpHash: "abc", securityLog: { k1: { type: "login", details: "IP: 1.2.x.x", ts: 5, ua: "UA" } } },
        plain: { balance: 3, pass: "plain-pass", securityAnswer: "Львів", telegramChatId: 42 },
        weird: { balance: 4, pass: 12345 },
        clean: { balance: 5 },
      },
      user_secrets: { modern: { pass: "stale-will-be-replaced" } },
      user_private: { modern: { email: "new@x.ua" } },
      some_junk_node: { a: 1 },
    });
    const before = await req("GET", "");

    const dry = runMigration();
    assert.match(dry, /DRY-RUN/);
    assert.match(dry, /some_junk_node/, "звіт має показати невідомий верхній вузол");
    assert.deepStrictEqual(await req("GET", ""), before, "dry-run нічого не змінює");

    const out = runMigration("--apply");
    assert.match(out, /needsReset[^\n]*weird/, "нерозпізнаний хеш → needsReset");
    assert.doesNotMatch(out, /plain-pass|sha-pass|modern-pass|pbkdf2\$/, "секрети не потрапляють у звіт");

    const db = await req("GET", "");
    for (const [nick, u] of Object.entries(db.users)) {
      for (const f of ["securityAnswerHash", "securityAnswer", "birthDate", "email", "lastIP", "lastIpHash", "telegramChatId", "securityLog"]) {
        assert.strictEqual(u[f], undefined, `users/${nick}/${f} мав зникнути`);
      }
      if (nick !== "weird") assert.strictEqual(u.pass, undefined, `users/${nick}/pass мав зникнути`);
    }
    const sec = db.user_secrets;
    assert.strictEqual(sec.modern.pass, modern, "pbkdf2 переноситься як є (старе місце пріоритетне)");
    assert.strictEqual(sec.modern.birthDate, "2001-02-03");
    assert.ok(sec.oldsha.pass.startsWith("pbkdf2sha$"), "SHA-256 обгорнуто в PBKDF2");
    assert.ok(sec.plain.pass.startsWith("pbkdf2$"), "відкритий пароль захешовано");
    assert.ok((await SlotOKPassword.verify("modern-pass", sec.modern.pass)).ok);
    assert.ok((await SlotOKPassword.verify("sha-pass", sec.oldsha.pass)).ok, "старий SHA-пароль досі підходить");
    assert.ok(!(await SlotOKPassword.verify("wrong", sec.oldsha.pass)).ok);
    assert.ok((await SlotOKPassword.verify("plain-pass", sec.plain.pass)).ok, "старий відкритий пароль підходить");
    assert.ok((await SlotOKPassword.verify("київ", sec.oldsha.securityAnswerHash)).ok, "відповідь (SHA) підходить");
    assert.ok((await SlotOKPassword.verify("львів", sec.plain.securityAnswerHash)).ok, "відкрита відповідь → хеш (lowercase)");
    assert.strictEqual(sec.weird.needsReset, true);
    assert.strictEqual(sec.clean, undefined, "чистий акаунт не чіпаємо");
    assert.strictEqual(db.user_private.modern.email, "new@x.ua", "новіше значення не затирається");
    assert.strictEqual(db.user_private.oldsha.lastIpHash, "abc");
    assert.strictEqual(db.user_private.oldsha.securityLog.k1.details, "IP: 1.2.x.x", "журнал безпеки переїхав");
    assert.strictEqual(db.user_private.plain.telegramChatId, 42);
    assert.strictEqual(db.users.plain.balance, 3, "решта профілю ціла");

    const again = runMigration("--apply");
    assert.match(again, /з полями для переносу: 1\b/, "повторний запуск чіпає лише weird (ідемпотентність)");
    console.log("OK — migrate-secrets: dry-run нічого не пише, --apply переносить і хешує, паролі досі підходять");
  } finally {
    proc.kill();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
