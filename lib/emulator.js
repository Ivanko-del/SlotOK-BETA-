// Локальний режим з емуляторами Firebase (scripts/dev-stack.js).
//
// Вмикається лише змінною FIREBASE_DATABASE_EMULATOR_HOST і ніколи на Vercel
// (там завжди є VERCEL=1). У цьому режимі:
//   - база — локальний емулятор, адмінський доступ — access_token=owner;
//   - service account — тимчасовий ключ, згенерований при старті процесу
//     (емулятор Auth не перевіряє підпис custom token);
//   - ID-токени від емулятора Auth непідписані (alg: none) — приймаємо їх.

const crypto = require("crypto");

const HOST = !process.env.VERCEL && process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const NS = "nye-slotok-default-rtdb";

let _sa = null;
function emulatorServiceAccount() {
  if (!_sa) {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    _sa = { project_id: "nye-slotok", client_email: "emulator@nye-slotok.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
  }
  return _sa;
}

module.exports = { EMULATOR: !!HOST, EMULATOR_DB_URL: HOST ? `http://${HOST}` : null, EMULATOR_NS: NS, emulatorServiceAccount };
