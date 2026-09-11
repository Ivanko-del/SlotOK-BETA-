// ============================================================
// SlotOK — хешування паролів (PBKDF2-HMAC-SHA256 + індивідуальна сіль)
//
// Один файл на два середовища: у браузері підключається тегом <script> і
// віддає глобальний SlotOKPassword, у серверних функціях підключається через
// require(). Так зроблено навмисно — раніше логіка хешування дублювалась між
// app.js і ботом, і будь-яка зміна мала шанс розʼїхатись між ними.
//
// Формат рядка, що лягає в базу (самоописовий, щоб перевірка знала параметри):
//   pbkdf2$<ітерацій>$<сіль-hex>$<хеш-hex>
//
// Старі акаунти зберігали або голий SHA-256, або взагалі відкритий пароль.
// verify() приймає обидва і повідомляє needsUpgrade — виклик після вдалого
// входу мовчки перезаписує запис у новий формат.
// ============================================================

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SlotOKPassword = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // OWASP-рекомендація для PBKDF2-HMAC-SHA256 (станом на 2024).
  const ITERATIONS = 210000;
  const SALT_BYTES = 16;
  const KEY_BITS = 256;

  function subtle() {
    const c = globalThis.crypto;
    if (!c || !c.subtle) {
      // У браузері crypto.subtle є лише в secure context (https або localhost).
      throw new Error("WebCrypto недоступний — потрібне HTTPS-зʼєднання");
    }
    return c.subtle;
  }

  function toHex(bytes) {
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function fromHex(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  // Порівняння за сталий час — щоб час відповіді не підказував, наскільки
  // введений хеш близький до збереженого.
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    return toHex(await subtle().digest("SHA-256", data));
  }

  async function derive(password, salt, iterations) {
    const key = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle().deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      KEY_BITS
    );
    return toHex(bits);
  }

  async function hash(password) {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const digest = await derive(password, salt, ITERATIONS);
    return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${digest}`;
  }

  function isModern(stored) {
    return typeof stored === "string" && stored.startsWith("pbkdf2$");
  }

  // { ok, needsUpgrade } — needsUpgrade означає, що пароль вірний, але лежить
  // у застарілому вигляді й після успішного входу його варто перезаписати.
  async function verify(password, stored) {
    if (stored === null || stored === undefined) return { ok: false, needsUpgrade: false };
    const s = String(stored);

    if (isModern(s)) {
      const parts = s.split("$");
      if (parts.length !== 4) return { ok: false, needsUpgrade: false };
      const iterations = parseInt(parts[1], 10);
      if (!Number.isFinite(iterations) || iterations <= 0) return { ok: false, needsUpgrade: false };
      const digest = await derive(password, fromHex(parts[2]), iterations);
      const ok = timingSafeEqual(digest, parts[3]);
      // Запис, зроблений за слабшими параметрами, теж підлягає оновленню.
      return { ok, needsUpgrade: ok && iterations < ITERATIONS };
    }

    // Спадщина 1: голий SHA-256 (64 hex-символи).
    if (/^[0-9a-f]{64}$/i.test(s)) {
      const ok = timingSafeEqual((await sha256Hex(password)).toLowerCase(), s.toLowerCase());
      return { ok, needsUpgrade: ok };
    }

    // Спадщина 2: пароль лежить у базі відкритим текстом.
    const ok = timingSafeEqual(password, s);
    return { ok, needsUpgrade: ok };
  }

  return { hash, verify, isModern, sha256Hex, ITERATIONS };
});
