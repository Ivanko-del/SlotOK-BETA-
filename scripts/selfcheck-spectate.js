// Self-check режиму глядача: публічний вигляд кожної кімнатної гри не містить
// приватного (карти, кораблі, міни, ходи, загадане), а `act` стороннього відхиляється.
// Запуск: node scripts/selfcheck-spectate.js
const assert = require("assert");
const crypto = require("crypto");

const { privateKey: saKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: gKey, publicKey: gPub } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({ project_id: "nye-slotok", client_email: "svc@x", private_key: saKey.export({ type: "pkcs8", format: "pem" }) });

let tree = {};
const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x === null || (Array.isArray(x) && x.length === 0) ? undefined : x)) ?? "null");
const getPath = (p) => p.split("/").filter(Boolean).reduce((n, k) => (n == null ? null : n[k]), tree) ?? null;
function setPath(p, value) {
  const parts = p.split("/").filter(Boolean);
  const last = parts.pop();
  const parent = parts.reduce((n, k) => (n[k] ??= {}), tree);
  const v = strip(value);
  if (v === null || v === undefined) delete parent[last]; else parent[last] = v;
}
let delay = 0;
global.fetch = async (url, opts = {}) => {
  if (url.startsWith("https://oauth2.googleapis.com")) return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  const p = decodeURIComponent(new URL(url).pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
  if (delay) await new Promise((r) => setTimeout(r, delay * Math.random()));
  const etag = JSON.stringify(getPath(p));
  if (method === "GET") return { ok: true, status: 200, headers: { get: () => etag }, json: async () => JSON.parse(JSON.stringify(getPath(p))) };
  if (method === "PUT") {
    const im = (opts.headers || {})["if-match"];
    if (im !== undefined && im !== JSON.stringify(getPath(p))) return { ok: false, status: 412, text: async () => "" };
    setPath(p, JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  if (method === "PATCH") {
    for (const [k, v] of Object.entries(JSON.parse(opts.body))) setPath(`${p}/${k}`, v);
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  throw new Error("unexpected " + method);
};
require("../lib/id-token")._setCertsForTests({ k: gPub.export({ type: "spki", format: "pem" }) });
require("../lib/player")._resetRateLimitForTests();
const handler = require("../api/room.js");
const { ROOM_GAMES } = require("../lib/room-games");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function tok(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "k" }), pl = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now, auth_time: now, exp: now + 600 });
  return `${h}.${pl}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${pl}`), gKey).toString("base64url")}`;
}
const resetRate = require("../lib/player")._resetRateLimitForTests;
let calls = 0;
const call = (uid, body) => new Promise((resolve) => {
  if (++calls % 40 === 0) resetRate();
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(d) { resolve({ status: this.statusCode, data: d }); }, end() { resolve({ status: this.statusCode, data: null }); } };
  handler({ method: "POST", headers: { authorization: "Bearer " + tok(uid) }, body }, res);
});
const bal = (u) => tree.users[u].balance;
const full = (id) => JSON.parse(tree.room_state[id].j);

const NAMES = ["ann", "ben", "cid", "dan", "eve", "fay"];
const PRIV_KEYS = ["hand", "hole", "fleet", "card", "my", "answers", "cells", "can"];
const HIDDEN_UNTIL_OVER = ["fleets", "mines", "secret", "guesses", "moves"];
function walk(o, fn, path = "") {
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { fn(k, v, path); walk(v, fn, path + "/" + k); }
}

(async () => {
  tree = { users: Object.fromEntries(NAMES.map((n) => [n, { balance: 100000 }])) };
  let checked = 0;
  for (const [game, def] of Object.entries(ROOM_GAMES)) {
    tree.room_of = {};
    const mass = !!def.lobbyMs;
    const size = def.sizes[def.sizes.length - 1] >= 6 ? 6 : def.sizes[0] > 6 ? 3 : def.sizes[def.sizes.length - 1];
    const n = mass ? 3 : size;
    const opts = game === "predict" ? { guess: 42 } : game === "coinflip" ? { side: "heads" } : {};
    let r = await call("ann", { action: "create", game, bet: 100, size, opts });
    assert.strictEqual(r.status, 200, game + ": " + JSON.stringify(r.data));
    const id = r.data.id;
    for (let k = 1; k < n; k++) assert.strictEqual((await call(NAMES[k], { action: "join", id })).status, 200, game + " join");
    if (full(id).status === "waiting") {
      const st = JSON.parse(tree.room_state[id].j); st.startBy = 1; tree.room_state[id].j = JSON.stringify(st);
      await call("ann", { action: "tick", id });
    }
    const room = full(id);
    if (room.status !== "playing") { console.log("  (" + game + " завершується на старті — пропущено)"); continue; }
    const pubNode = tree.rooms[game][id];
    const pubStr = JSON.stringify(pubNode);
    const pub = JSON.parse(pubNode.v);
    // 1) жодне приватне поле не потрапило в публічний вигляд
    room.players.forEach((nick, seat) => {
      const priv = def.priv(room.state, seat);
      for (const [k, v] of Object.entries(priv)) {
        if (v === null || v === undefined || (Array.isArray(v) && !v.length) || v === "" ) continue;
        const js = JSON.stringify(v);
        assert.ok(!pubStr.includes(js), `${game}: приватне поле ${k} місця ${seat} є в публічному вигляді`);
        if (k === "hand" || k === "hole") v.forEach((c) => assert.ok(!pubStr.includes(`"${c}"`), `${game}: карта ${c} гравця ${nick} видна глядачу`));
      }
    });
    // 2) заборонені ключі й секрети до кінця гри
    walk(pub, (k, v) => {
      assert.ok(!PRIV_KEYS.includes(k) || typeof v === "number", `${game}: у публічному вигляді ключ ${k}`);
      if (k === "deck") assert.ok(typeof v === "number", `${game}: колода має бути лічильником`);
    });
    if (!pub.over) for (const k of HIDDEN_UNTIL_OVER) assert.ok(pub[k] === undefined || pub[k] === null, `${game}: ${k} відкрито до кінця гри`);
    if (pub.phase === "pick") assert.ok(pub.picks === undefined, `${game}: вибори видно до розкриття`);
    // 3) глядач (сторонній) не може ходити, нічого не міняється
    const outsider = NAMES[5] === room.players[5] || room.players.includes("fay") ? "gus" : "fay";
    tree.users[outsider] = tree.users[outsider] || { balance: 100000 };
    const b0 = bal(outsider), ver0 = full(id).ver, tot0 = JSON.stringify(Object.fromEntries(Object.entries(tree.users).map(([k, u]) => [k, u.balance])));
    for (const mv of [{ a: "fold" }, { a: "draw" }, { a: "roll" }, { m: "rock" }, { g: 5 }, { x: 0, y: 0 }]) {
      const a = await call(outsider, { action: "act", id, move: mv });
      assert.strictEqual(a.status, 403, `${game}: act чужого мав бути 403, а не ${a.status}`);
    }
    assert.strictEqual((await call(outsider, { action: "leave", id })).status, 403, game + ": leave чужого");
    assert.strictEqual(bal(outsider), b0, game + ": баланс глядача не змінився");
    assert.strictEqual(full(id).ver, ver0, game + ": стан не змінився");
    assert.strictEqual(JSON.stringify(Object.fromEntries(Object.entries(tree.users).map(([k, u]) => [k, u.balance]))), tot0, game + ": баланси");
    // 4) чужий приватний вигляд через API недоступний глядачу
    const vw = await call(outsider, { action: "view", id });
    assert.ok(vw.status !== 200 || !vw.data.priv, game + ": view віддав приватне стороннім");
    checked++;
  }
  assert.ok(checked >= 8, "перевірено ігор: " + checked);
  console.log("OK — режим глядача: публічні вигляди " + checked + " ігор без приватного, act/leave стороннього відхилено без змін");
})().catch((e) => { console.error(e); process.exit(1); });
