// Self-check для password.js. Запуск: node scripts/selfcheck-password-hash.js
//
// Це шлях автентифікації, тому найважливіше закріпити дві речі:
// 1) однаковий пароль дає РІЗНІ записи (сіль справді випадкова — інакше
//    одна веселкова таблиця відкриває всі акаунти одразу);
// 2) старі акаунти (голий SHA-256 і відкритий текст) досі входять, але
//    позначаються needsUpgrade, щоб мовчки переїхати на новий формат.
const assert = require("assert");
const P = require("../password.js");

async function main() {
  // 1. Базовий цикл: свій пароль підходить, чужий — ні.
  const stored = await P.hash("правильний-пароль");
  assert.ok(P.isModern(stored), "новий запис має бути у форматі pbkdf2$");
  assert.strictEqual((await P.verify("правильний-пароль", stored)).ok, true);
  assert.strictEqual((await P.verify("неправильний", stored)).ok, false);
  assert.strictEqual((await P.verify("", stored)).ok, false);

  // 2. Свіжий запис оновлювати не треба.
  assert.strictEqual((await P.verify("правильний-пароль", stored)).needsUpgrade, false);

  // 3. Сіль випадкова — два хеші того самого пароля не збігаються.
  const again = await P.hash("правильний-пароль");
  assert.notStrictEqual(stored, again, "однаковий пароль не має давати однаковий запис");
  assert.strictEqual((await P.verify("правильний-пароль", again)).ok, true);

  // 4. Формат: pbkdf2$<ітерації>$<сіль>$<хеш>, з реальною кількістю ітерацій.
  const parts = stored.split("$");
  assert.strictEqual(parts.length, 4);
  assert.strictEqual(parts[0], "pbkdf2");
  assert.strictEqual(parseInt(parts[1], 10), P.ITERATIONS);
  assert.ok(P.ITERATIONS >= 210000, "ітерацій має бути не менше рекомендованих OWASP");
  assert.strictEqual(parts[2].length, 32, "сіль — 16 байтів у hex");
  assert.strictEqual(parts[3].length, 64, "ключ — 32 байти у hex");

  // 5. Спадщина: голий SHA-256 приймається, але просить оновлення.
  const legacySha = await P.sha256Hex("старий-пароль");
  let r = await P.verify("старий-пароль", legacySha);
  assert.strictEqual(r.ok, true, "акаунт зі старим SHA-256 має входити далі");
  assert.strictEqual(r.needsUpgrade, true, "і має бути позначений на оновлення");
  assert.strictEqual((await P.verify("не той", legacySha)).ok, false);

  // 6. Спадщина: пароль відкритим текстом теж приймається й оновлюється.
  r = await P.verify("plain123", "plain123");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.needsUpgrade, true);
  assert.strictEqual((await P.verify("plain999", "plain123")).ok, false);

  // 7. Запис зі слабшими параметрами підлягає оновленню навіть у новому форматі.
  const weak = stored.replace(`$${P.ITERATIONS}$`, "$1000$");
  assert.strictEqual((await P.verify("будь-що", weak)).needsUpgrade, false, "невірний пароль не оновлюємо");

  // 8. Биті/порожні значення не повинні пускати нікого й не повинні кидати.
  for (const bad of [null, undefined, "", "pbkdf2$", "pbkdf2$a$b$c$d", "pbkdf2$0$aa$bb"]) {
    assert.strictEqual((await P.verify("хоч що", bad)).ok, false, `битий запис ${JSON.stringify(bad)} не має пускати`);
  }

  // 9. Юнікод і довгі паролі не ламають кодування.
  const uni = await P.hash("пароль-з-емодзі-🎰-та-кирилицею");
  assert.strictEqual((await P.verify("пароль-з-емодзі-🎰-та-кирилицею", uni)).ok, true);
  assert.strictEqual((await P.verify("пароль-з-емодзі-🎲-та-кирилицею", uni)).ok, false);

  console.log("OK — PBKDF2, випадкова сіль, і обидва старі формати мігрують коректно");
}

main().catch((err) => { console.error("SELFCHECK FAILED:", err.message); process.exit(1); });
