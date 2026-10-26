// Sends real Firebase Cloud Messaging push notifications via the FCM HTTP v1
// REST API, using only Node's built-in crypto/fetch — no firebase-admin
// dependency, matching the rest of this project's zero-npm-package server
// code (see lib/firebase.js, lib/telegram.js for the same pattern).
//
// Requires the FIREBASE_SERVICE_ACCOUNT_KEY env var: the full JSON key for a
// service account with Firebase Cloud Messaging access, downloaded from
// Firebase Console → Project Settings → Service Accounts → "Generate new
// private key". Paste its entire JSON content as this env var's value in
// Vercel (Project Settings → Environment Variables → add for Production).
// Without it, sendPush()/sendPushToUser() log a warning and no-op — the rest
// of the app keeps working either way.

const { getServiceAccount, getAccessToken: getScopedToken, FCM_SCOPE } = require("./google-auth");

// Service-account parsing and the JWT-bearer token exchange live in
// lib/google-auth.js (shared with the database client and api/auth.js).
function getAccessToken() {
  return getScopedToken(FCM_SCOPE);
}

// Sends one push to one FCM device token.
// Returns 'ok' | 'invalid-token' (caller should stop using this token) | 'error'.
async function sendPush(token, title, body, data) {
  const sa = getServiceAccount();
  if (!sa) { console.warn("sendPush: FIREBASE_SERVICE_ACCOUNT_KEY not configured, skipping"); return "error"; }
  const accessToken = await getAccessToken();
  if (!accessToken) return "error";

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        webpush: { fcm_options: { link: "/" }, notification: { icon: "/icons/icon-192.png" } },
        data: data || {},
      },
    }),
  });
  if (res.ok) return "ok";
  if (res.status === 404) return "invalid-token"; // token unregistered/expired on the device side
  console.warn("sendPush failed:", res.status, await res.text().catch(() => ""));
  return "error";
}

// Sends the same push to every FCM token stored for a user
// (users/<nick>/fcmTokens/<token>: true), pruning tokens FCM reports as
// permanently invalid so the list doesn't grow forever.
async function sendPushToUser(dbGet, dbUpdate, nick, title, body, data) {
  const tokens = await dbGet(`users/${nick}/fcmTokens`);
  if (!tokens) return;
  for (const token of Object.keys(tokens)) {
    const result = await sendPush(token, title, body, data);
    if (result === "invalid-token") {
      dbUpdate(`users/${nick}/fcmTokens`, { [token]: null }).catch(() => {});
    }
  }
}

module.exports = { sendPush, sendPushToUser };
