// Minimal Firebase Realtime Database REST client — no SDK.
//
// With FIREBASE_SERVICE_ACCOUNT_KEY configured, every request carries a
// service-account OAuth2 access token, i.e. runs with admin rights and
// bypasses database rules. That is what lets database.rules.json lock
// server-only nodes (bot_config, telegram_links, notify_rate, …) away from
// browsers while the bot and api/* keep working.
//
// Without the key requests go out unauthenticated, exactly as before, so the
// server keeps working against the old fully-open database.

const { getAccessToken, DB_SCOPE } = require("./google-auth");
const { EMULATOR_DB_URL, EMULATOR_NS } = require("./emulator");

const DB_URL = EMULATOR_DB_URL || "https://nye-slotok-default-rtdb.firebaseio.com";

async function dbUrl(path, query) {
  const params = new URLSearchParams(query || {});
  if (EMULATOR_DB_URL) params.set("ns", EMULATOR_NS);
  const token = await getAccessToken(DB_SCOPE);
  if (token) params.set("access_token", token);
  const qs = params.toString();
  return `${DB_URL}/${path}.json${qs ? "?" + qs : ""}`;
}

async function check(res, what) {
  if (res.ok) return res;
  const body = await (res.text ? res.text().catch(() => "") : "");
  throw new Error(`${what} failed: HTTP ${res.status} ${body}`.trim());
}

async function dbGet(path) {
  const res = await fetch(await dbUrl(path));
  // Without the status check a "Permission denied" body ({error: "..."})
  // would be returned as if it were the stored value.
  await check(res, `dbGet(${path})`);
  return res.json();
}

async function dbSet(path, value) {
  const res = await fetch(await dbUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  await check(res, `dbSet(${path})`);
}

async function dbUpdate(path, value) {
  const res = await fetch(await dbUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  await check(res, `dbUpdate(${path})`);
}

async function dbPush(path, value) {
  const res = await fetch(await dbUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  await check(res, `dbPush(${path})`);
  return res.json(); // { name: "<new key>" }
}

async function dbDelete(path) {
  const res = await fetch(await dbUrl(path), { method: "DELETE" });
  await check(res, `dbDelete(${path})`);
}

// Compare-and-set via ETag/if-match. `mutate(current)` returns the new value,
// or undefined to abort (nothing written, resolves to { committed: false }).
// Concurrent writers to the same path can't overwrite each other: a 412 means
// someone else won since our read, and we retry on fresh data.
async function dbTransaction(path, mutate, retries = 8) {
  for (let i = 0; i < retries; i++) {
    const getRes = await fetch(await dbUrl(path), { headers: { "X-Firebase-ETag": "true" } });
    await check(getRes, `dbTransaction(${path}) read`);
    const etag = getRes.headers.get("ETag");
    const current = await getRes.json();
    const next = mutate(current);
    if (next === undefined) return { committed: false, value: current };

    const putRes = await fetch(await dbUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "if-match": etag },
      body: JSON.stringify(next),
    });
    if (putRes.ok) return { committed: true, value: next };
    if (putRes.status !== 412) await check(putRes, `dbTransaction(${path})`);
  }
  throw new Error(`dbTransaction(${path}): too much contention after ${retries} retries`);
}

// Atomic increment, built on dbTransaction (two approvals landing at once
// can't overwrite each other the way a plain read-then-write would).
async function dbIncrement(path, amount, retries = 5) {
  try {
    const { value } = await dbTransaction(path, (cur) => (cur || 0) + amount, retries);
    return value;
  } catch (e) {
    if (/too much contention/.test(e.message)) {
      throw new Error(`dbIncrement(${path}): too much contention after ${retries} retries`);
    }
    throw e;
  }
}

module.exports = { dbGet, dbSet, dbUpdate, dbPush, dbIncrement, dbTransaction, dbDelete, DB_URL };
