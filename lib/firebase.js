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

async function dbIncrement(path, amount) {
  const current = (await dbGet(path)) || 0;
  const next = current + amount;
  await dbSet(path, next);
  return next;
}

module.exports = { dbGet, dbSet, dbUpdate, dbPush, dbIncrement, dbDelete };
