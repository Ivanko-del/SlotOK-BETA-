// Google service-account helpers shared by the server code: OAuth2 access
// tokens (for the Realtime Database REST API and FCM) and Firebase Auth
// custom tokens (for signing players in from api/auth.js).
//
// Pure Node crypto/fetch, no firebase-admin, same as the rest of lib/.
//
// Everything here reads the FIREBASE_SERVICE_ACCOUNT_KEY env var (the full
// JSON key from Firebase Console → Project Settings → Service Accounts →
// "Generate new private key"). Without it every function returns null and
// callers fall back to their old, unauthenticated behaviour.

const crypto = require("crypto");
const { EMULATOR, emulatorServiceAccount } = require("./emulator");

const DB_SCOPE = "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const CUSTOM_TOKEN_AUD = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

const _tokens = new Map(); // scope -> { token, expiresAt }
let _sa; // undefined = not parsed yet, null = missing/invalid

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getServiceAccount() {
  if (_sa !== undefined) return _sa;
  if (EMULATOR) return (_sa = emulatorServiceAccount());
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return (_sa = null);
  try {
    const sa = JSON.parse(raw);
    _sa = sa && sa.client_email && sa.private_key ? sa : null;
    if (!_sa) console.warn("FIREBASE_SERVICE_ACCOUNT_KEY has no client_email/private_key");
  } catch (e) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON:", e.message);
    _sa = null;
  }
  return _sa;
}

function signJwt(sa, claims) {
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = base64url(crypto.sign("RSA-SHA256", Buffer.from(unsigned), sa.private_key));
  return `${unsigned}.${signature}`;
}

// Standard JWT-bearer OAuth2 flow, cached until ~1 minute before expiry.
async function getAccessToken(scope) {
  if (EMULATOR) return scope === DB_SCOPE ? "owner" : null;
  const cached = _tokens.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const sa = getServiceAccount();
  if (!sa) return null;

  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt(sa, {
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) {
    console.warn("Google token exchange failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = await res.json();
  _tokens.set(scope, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

// Firebase Auth custom token: the browser exchanges it with
// firebase.auth().signInWithCustomToken(), after which database rules see
// auth.uid === uid. Valid for at most one hour (only for the exchange; the
// SDK then keeps the session alive with its own refresh token).
function createCustomToken(uid, claims) {
  const sa = getServiceAccount();
  if (!sa) return null;
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: sa.client_email, sub: sa.client_email, aud: CUSTOM_TOKEN_AUD, iat: now, exp: now + 3600, uid: String(uid) };
  if (claims && Object.keys(claims).length) body.claims = claims;
  return signJwt(sa, body);
}

function _resetForTests() {
  _sa = undefined;
  _tokens.clear();
}

module.exports = { getServiceAccount, getAccessToken, createCustomToken, DB_SCOPE, FCM_SCOPE, base64url, _resetForTests };
