// Щоденні місії з серією — рахує лише сервер.
//
// Вузол users-незалежний: missions/<нік> = {
//   day: "2026-11-16",            доба (межа — UTC+2, shared/missions.js)
//   p:   ["rounds_5", …],         три місії доби (id з MISSION_POOL), для екрана
//   c:   { rounds, wager, wins, room, m2, m5 },   лічильники доби
//   g:   { dice: 1, … },          різні ігри доби
//   cl:  { 0: true, … },          які місії вже забрано
//   s:   { n, last, pend },       серія: день драбини, остання доба, непіднята нагорода
// }
// Усі зміни — транзакція на весь вузол (ETag), тож паралельні події й
// паралельні «забрати» не гублять одне одного. Браузер вузол лише читає.
//
// Події приходять тільки з сервера: recordWager (api/play, round, room, live)
// і виплати (lib/rooms.js, lib/live.js, api/round.js). Доба змінилась — лічильники
// скидаються при першій же події чи запиті, серія переходить далі.

const crypto = require("crypto");
const M = require("../shared/missions");
const { dbGet, dbTransaction } = require("./firebase");
const { moveBalance } = require("./player");
const P = require("./progress");
const R = require("../shared/rewards");

const num = (v) => Number(v) || 0;
const GAME_RE = /^[a-z0-9_-]{1,32}$/;
const POOL = Object.fromEntries(M.MISSION_POOL.map((t) => [t.id, t]));
const nodePath = (nick) => `missions/${nick}`;

// Три місії доби: впорядковуємо пул за sha256(сіль|доба|нік|id) і беремо перші
// три з різними kind. Один і той самий гравець у ту саму добу — завжди ті самі.
function pick(day, nick) {
  const scored = M.MISSION_POOL.map((t) => ({ t, h: crypto.createHash("sha256").update(`slotok-missions-v1|${day}|${nick}|${t.id}`).digest("hex") }));
  scored.sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  const out = [], kinds = new Set();
  for (const { t } of scored) {
    if (kinds.has(t.kind)) continue;
    kinds.add(t.kind);
    out.push(t);
    if (out.length === M.MISSION_COUNT) break;
  }
  return out;
}

// Вузол на потрібну добу: вчорашні лічильники скидаємо, серію зберігаємо.
function normalize(cur, day, nick) {
  const base = cur && typeof cur === "object" ? cur : {};
  if (base.day === day && Array.isArray(base.p) && base.p.length === M.MISSION_COUNT && base.p.every((id) => POOL[id])) return base;
  const fresh = base.day === day ? base : { day, c: {}, g: {}, cl: {}, s: base.s || { n: 0, last: "", pend: 0 } };
  return { ...fresh, day, p: pick(day, nick).map((t) => t.id) };
}

const picksOf = (node) => node.p.map((id) => POOL[id]);
function progressOf(node, t) {
  if (t.kind === "games") return Object.keys(node.g || {}).length;
  return num((node.c || {})[t.kind]);
}
const isDone = (node, t) => progressOf(node, t) >= t.target;

// Серія дня: n — день драбини, що діє зараз (0, якщо добу пропущено).
function effectiveStreak(s, day) {
  if (!s || !s.last) return 0;
  return s.last === day || s.last === M.missionPrevDay(day) ? num(s.n) : 0;
}

// Подія → новий стан вузла. ev: { bet?, game?, room?, win?, mult? }.
function applyEvent(node, ev, day) {
  const c = { ...(node.c || {}) };
  const g = { ...(node.g || {}) };
  if (num(ev.bet) >= M.MISSION_MIN_BET) {
    c.rounds = num(c.rounds) + 1;
    c.wager = num(c.wager) + Math.floor(ev.bet);
    if (typeof ev.game === "string" && GAME_RE.test(ev.game)) g[ev.game] = 1;
    if (ev.room) c.room = num(c.room) + 1;
  }
  if (ev.win) {
    c.wins = num(c.wins) + 1;
    if (M.MISSION_MULT_GAMES.includes(ev.game)) {
      if (num(ev.mult) >= 2) c.m2 = num(c.m2) + 1;
      if (num(ev.mult) >= 5) c.m5 = num(c.m5) + 1;
    }
  }
  const next = { ...node, c, g };
  // Усі три виконано — серія просувається (раз за добу). Доба підряд → наступний
  // день драбини (після 7-го знову 1-й), пропуск → з першого.
  const s = node.s || { n: 0, last: "", pend: 0 };
  if (s.last !== day && picksOf(next).every((t) => isDone(next, t))) {
    const n = s.last === M.missionPrevDay(day) ? (num(s.n) % M.MISSION_STREAK_LADDER.length) + 1 : 1;
    next.s = { n, last: day, pend: n };
  }
  return next;
}

async function record(nick, ev, now = Date.now()) {
  const day = M.missionDay(now);
  await dbTransaction(nodePath(nick), (cur) => applyEvent(normalize(cur, day, nick), ev, day));
}
// Облік місій не має зривати гру: баланс уже змінено, помилку лише логуємо.
async function safeRecord(nick, ev, now) {
  try { await record(nick, ev, now); }
  catch (e) { console.error("missions record failed", e); }
}

function view(node, day, now) {
  const s = node.s || { n: 0, last: "", pend: 0 };
  return {
    day, serverNow: now, resetAt: M.missionDayEnd(now),
    missions: picksOf(node).map((t, i) => ({
      i, id: t.id, kind: t.kind, title: t.title, icon: t.icon, tier: t.tier, amount: !!t.amount, target: t.target,
      progress: Math.min(t.target, progressOf(node, t)), done: isDone(node, t), claimed: !!(node.cl && node.cl[i]),
      reward: M.MISSION_REWARDS[t.tier],
    })),
    streak: { n: effectiveStreak(s, day), todayDone: s.last === day, pend: num(s.pend), ladder: M.MISSION_STREAK_LADDER },
  };
}

// Стан для екрана; доба нова — створює вузол (місії видно й у реальному часі).
async function state(nick, now = Date.now()) {
  const day = M.missionDay(now);
  const tx = await dbTransaction(nodePath(nick), (cur) => {
    const n = normalize(cur, day, nick);
    return n === cur ? undefined : n;
  });
  return { ok: true, ...view(tx.committed ? tx.value : normalize(tx.value, day, nick), day, now) };
}

const no = (status, error, message, extra) => ({ ok: false, status, error, message, ...(extra || {}) });

// Додає XP Battle Pass так само, як recordWager (рівень — за shared/rewards.js).
async function addBpXp(nick, xp, now) {
  if (!(xp > 0)) return;
  await P.ensureSeason(nick, now);
  const t = await dbTransaction(`users/${nick}/bpXP`, (c) => num(c) + xp);
  const total = num(t.value);
  const level = R.bpLevelFromXp(total);
  if (level !== R.bpLevelFromXp(total - xp)) await dbTransaction(`users/${nick}/bpLevel`, () => level);
}

async function claimMission(nick, i, now = Date.now()) {
  if (!Number.isInteger(i) || i < 0 || i >= M.MISSION_COUNT) return no(400, "bad_mission", "Невідома місія");
  const day = M.missionDay(now);
  let why = null, picked = null;
  const tx = await dbTransaction(nodePath(nick), (cur) => {
    const node = normalize(cur, day, nick);
    picked = picksOf(node)[i];
    why = null;
    if (!isDone(node, picked)) { why = "unfinished"; return undefined; }
    if (node.cl && node.cl[i]) { why = "already"; return undefined; }
    return { ...node, cl: { ...(node.cl || {}), [i]: true } };
  });
  if (!tx.committed) {
    return why === "already" ? no(409, "already", "Нагороду вже забрано") : no(409, "unfinished", "Місію ще не виконано");
  }
  const reward = M.MISSION_REWARDS[picked.tier];
  let bal;
  try {
    bal = await moveBalance(nick, reward.coins);
  } catch (e) {
    // Гроші не пройшли — знімаємо позначку, щоб можна було забрати знову.
    await dbTransaction(nodePath(nick), (cur) => (cur && cur.day === day && cur.cl && cur.cl[i] ? { ...cur, cl: { ...cur.cl, [i]: null } } : undefined)).catch(() => {});
    throw e;
  }
  await addBpXp(nick, reward.xp, now).catch((e) => console.error("missions xp failed", e));
  return { ok: true, i, coins: reward.coins, xp: reward.xp, balance: bal.balance };
}

async function claimStreak(nick, now = Date.now()) {
  const day = M.missionDay(now);
  let pend = 0;
  const tx = await dbTransaction(nodePath(nick), (cur) => {
    const node = normalize(cur, day, nick);
    pend = num((node.s || {}).pend);
    if (!(pend >= 1 && pend <= M.MISSION_STREAK_LADDER.length)) { pend = 0; return undefined; }
    return { ...node, s: { ...node.s, pend: 0 } };
  });
  if (!tx.committed) return no(409, "nothing", "Нагороди серії зараз немає — виконай усі три місії");
  const reward = M.MISSION_STREAK_LADDER[pend - 1];
  let bal;
  try {
    bal = await moveBalance(nick, reward.coins);
  } catch (e) {
    // Не видано — повертаємо непіднятою (лише якщо за цей час не з'явилась нова).
    await dbTransaction(nodePath(nick), (cur) => (cur && cur.s && !num(cur.s.pend) ? { ...cur, s: { ...cur.s, pend } } : undefined)).catch(() => {});
    throw e;
  }
  // Скриня — після грошей і без повторної спроби: щоб збій не видав ₴ удруге.
  if (reward.box) await dbTransaction(`users/${nick}/lootboxInv/bp`, (c) => num(c) + reward.box).catch((e) => console.error("missions box failed", e));
  return { ok: true, day: pend, coins: reward.coins, box: reward.box || 0, balance: bal.balance };
}

module.exports = { pick, normalize, applyEvent, record, safeRecord, state, claimMission, claimStreak, effectiveStreak, POOL };
