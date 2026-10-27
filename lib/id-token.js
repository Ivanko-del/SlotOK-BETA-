// Перевірка Firebase ID token (те, що браузер отримує після
// signInWithCustomToken і віддає через firebase.auth().currentUser.getIdToken()).
//
// Без firebase-admin: публічні сертифікати Google securetoken + Node crypto,
// за офіційним описом формату (RS256, aud = projectId,
// iss = https://securetoken.google.com/<projectId>, sub = uid).

const crypto = require("crypto");
const { getServiceAccount } = require("./google-auth");
const { EMULATOR } = require("./emulator");

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const DEFAULT_PROJECT = "nye-slotok";

let _certs = null; // { keys: {kid: pem}, expiresAt }

async function getCerts() {
  if (_certs && _certs.expiresAt > Date.now()) return _certs.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`securetoken certs: HTTP ${res.status}`);
  const keys = await res.json();
  const maxAge = /max-age=(\d+)/.exec((res.headers && res.headers.get && res.headers.get("cache-control")) || "");
  _certs = { keys, expiresAt: Date.now() + (maxAge ? Number(maxAge[1]) * 1000 : 3600000) };
  return keys;
}

function projectId() {
  const sa = getServiceAccount();
  return (sa && sa.project_id) || DEFAULT_PROJECT;
}

/** Повертає uid (нік) або кидає помилку з .code = 'bad_token'. */
async function verifyIdToken(token) {
  const fail = (why) => Object.assign(new Error(`invalid ID token: ${why}`), { code: "bad_token" });
  if (typeof token !== "string" || token.split(".").length !== 3) throw fail("format");
  const [h, p, s] = token.split(".");
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(h, "base64url"));
    claims = JSON.parse(Buffer.from(p, "base64url"));
  } catch {
    throw fail("json");
  }
  if (EMULATOR && header.alg === "none") { // емулятор Auth, лише локально
    if (typeof claims.sub !== "string" || !claims.sub) throw fail("sub");
    return claims.sub;
  }
  if (header.alg !== "RS256" || !header.kid) throw fail("alg");
  const certs = await getCerts();
  const pem = certs[header.kid];
  if (!pem) throw fail("kid");
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey(pem), Buffer.from(s, "base64url"));
  if (!ok) throw fail("signature");
  const now = Math.floor(Date.now() / 1000);
  const pid = projectId();
  if (claims.aud !== pid) throw fail("aud");
  if (claims.iss !== `https://securetoken.google.com/${pid}`) throw fail("iss");
  if (!(claims.exp > now - 5)) throw fail("expired");
  if (!(claims.iat <= now + 300) || !(claims.auth_time <= now + 300)) throw fail("iat");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) throw fail("sub");
  return claims.sub;
}

function _setCertsForTests(keys) {
  _certs = keys ? { keys, expiresAt: Date.now() + 3600000 } : null;
}

module.exports = { verifyIdToken, _setCertsForTests };
