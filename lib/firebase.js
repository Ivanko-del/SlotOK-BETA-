// Minimal Firebase Realtime Database REST client — no SDK, no service account needed.
// Same trust model as the rest of the app (client-open DB), used server-side here
// only so the bot can act without exposing these operations to the browser.

const DB_URL = "https://nye-slotok-default-rtdb.firebaseio.com";

async function dbGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  return res.json();
}

async function dbSet(path, value) {
  await fetch(`${DB_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function dbUpdate(path, value) {
  await fetch(`${DB_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function dbPush(path, value) {
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  return res.json(); // { name: "<new key>" }
}

async function dbDelete(path) {
  await fetch(`${DB_URL}/${path}.json`, { method: "DELETE" });
}

// Atomic increment via Firebase REST conditional writes (ETag/if-match), so
// concurrent increments to the same path (e.g. two approvals landing at once)
// can't overwrite each other the way a plain read-then-write would.
async function dbIncrement(path, amount, retries = 5) {
  for (let i = 0; i < retries; i++) {
    const getRes = await fetch(`${DB_URL}/${path}.json`, {
      headers: { "X-Firebase-ETag": "true" },
    });
    const etag = getRes.headers.get("ETag");
    const current = (await getRes.json()) || 0;
    const next = current + amount;

    const putRes = await fetch(`${DB_URL}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "if-match": etag },
      body: JSON.stringify(next),
    });
    if (putRes.ok) return next;
    if (putRes.status !== 412) {
      throw new Error(`dbIncrement(${path}) failed: HTTP ${putRes.status}`);
    }
    // 412 = another writer won the race since our GET; retry with a fresh read.
  }
  throw new Error(`dbIncrement(${path}): too much contention after ${retries} retries`);
}

module.exports = { dbGet, dbSet, dbUpdate, dbPush, dbIncrement, dbDelete };
