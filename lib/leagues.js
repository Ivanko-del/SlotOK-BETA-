// Рейтингові ліги: сезонний Elo-рейтинг для онлайн-ігор на навичку. Рахує лише сервер.
//
// Вузли:
//   league/<нік>            — особистий (читає лише власник): {
//       s: "2026-11",       сезон, у якому лежить рейтинг
//       r, g, w, l,         рейтинг, рейтингові партії, перемоги, поразки сезону
//       pend: { "2026-10": { tier, r } },   завершені сезони, нагороду за які ще не забрано
//       prev: { s, tier, r },               останній завершений сезон (для екрана)
//       pd: { day, o: { <суперник>: n } },  скільки рейтингових партій проти кожного за добу
//       recent: [{ id, game, d, r, res, t, opp }]   останні 10 результатів (новіші спереду)
//   }
//   league_pub/<сезон>/<нік> — публічно: { nick, rating, tier, games } (індекс за rating)
//   league_done/<кімната>    — позначка «розраховано» + зафіксовані Δ (закритий для браузера)
//
// Рівно раз на кімнату: league_done/<id> створюється транзакцією разом із Δ усіх
// гравців; решта — повторювані ідемпотентні кроки (у recent кожного є id кімнати),
// тож паралельний чи повторний settle нічого не задвоїть, а обірваний — доробить.

const R = require("../shared/leagues");
const M = require("../shared/missions");
const { dbGet, dbSet, dbTransaction } = require("./firebase");
const { moveBalance } = require("./player");

const num = (v) => Number(v) || 0;
const nodePath = (nick) => `league/${nick}`;
const no = (status, error, message, extra) => ({ ok: false, status, error, message, ...(extra || {}) });

function fresh(season) {
  return { s: season, r: R.LEAGUE_START, g: 0, w: 0, l: 0, pend: {}, recent: [] };
}

// Вузол на потрібний сезон. Новий сезон: фінальну лігу минулого запам'ятовуємо
// (нагорода — якщо зіграно ≥ LEAGUE_MIN_GAMES), рейтинг м'яко повертається до 1000.
function normalize(cur, season) {
  if (!cur || typeof cur !== "object") return fresh(season);
  if (cur.s === season) return { ...cur, pend: cur.pend || {}, recent: cur.recent || [] };
  const tier = R.leagueTier(cur.r).id;
  const pend = { ...(cur.pend || {}) };
  if (num(cur.g) >= R.LEAGUE_MIN_GAMES) pend[cur.s] = { tier, r: num(cur.r) };
  // Тримаємо не більше трьох невзятих сезонів (найновіші).
  const keys = Object.keys(pend).sort().slice(-3);
  const kept = Object.fromEntries(keys.map((k) => [k, pend[k]]));
  return {
    ...cur, s: season, r: R.leagueSoftReset(cur.r), g: 0, w: 0, l: 0, pend: kept,
    prev: { s: cur.s, tier, r: num(cur.r), g: num(cur.g) },
  };
}

const pubRow = (nick, n) => ({ nick, rating: n.r, tier: R.leagueTier(n.r).id, games: n.g });

// ── Розрахунок кімнати ──

// Чи рейтингується ця кімната (чиста функція від збереженого стану кімнати).
function rated(room) {
  if (!room || !room.result || !R.LEAGUE_GAMES[room.game]) return false;
  if (!Array.isArray(room.players) || new Set(room.players).size < 2) return false;
  const res = room.result;
  if (res.draw || !Array.isArray(res.winners) || !res.winners.length || res.winners.length >= room.players.length) return false;
  if (room.started && room.finishedAt && room.finishedAt - room.started < R.LEAGUE_MIN_MS) return false;
  return true;
}

async function rateRoom(room, now = Date.now()) {
  if (!rated(room)) return { rated: false };
  const season = R.leagueSeason(now).id;
  const day = M.missionDay(now);
  const players = room.players;

  // 1) Зафіксувати Δ (або прочитати вже зафіксовані).
  let plan = null;
  const nodes = await Promise.all(players.map(async (n) => normalize(await dbGet(nodePath(n)), season)));
  const used = (node, other) => (node.pd && node.pd.day === day ? num((node.pd.o || {})[other]) : 0);
  const ok = (i, j) => used(nodes[i], players[j]) < R.LEAGUE_PAIR_DAILY && used(nodes[j], players[i]) < R.LEAGUE_PAIR_DAILY;
  const seats = room.result.winners.map((n) => players.indexOf(n)).filter((s) => s >= 0);
  const { deltas, opp } = R.leagueDeltas(nodes.map((n) => n.r), seats, ok);
  const mine = {};
  players.forEach((n, i) => { if (opp[i].length) mine[n] = { d: deltas[i], o: opp[i].map((j) => players[j]), win: seats.includes(i) ? 1 : 0 }; });
  const claim = await dbTransaction(`league_done/${room.id}`, (cur) => (cur ? undefined : { t: now, game: room.game, season, day, p: mine }));
  plan = claim.committed ? claim.value : await dbGet(`league_done/${room.id}`);
  if (!plan || !plan.p) return { rated: true, applied: {} };

  // 2) Застосувати кожному (ідемпотентно за id кімнати).
  const applied = {};
  await Promise.all(Object.entries(plan.p).map(async ([nick, p]) => {
    let after = null;
    const tx = await dbTransaction(nodePath(nick), (cur) => {
      const node = normalize(cur, plan.season);
      if (node.recent.some((e) => e.id === room.id)) return undefined; // уже зараховано
      const r = Math.max(0, node.r + p.d);
      const pdOld = node.pd && node.pd.day === plan.day ? node.pd.o || {} : {};
      const o = { ...pdOld };
      (p.o || []).forEach((x) => { o[x] = num(o[x]) + 1; });
      const entry = { id: room.id, game: room.game, d: p.d, r, res: p.win ? "w" : "l", t: plan.t, opp: (p.o || []).slice(0, 5) };
      after = {
        ...node, r, g: node.g + 1, w: node.w + (p.win ? 1 : 0), l: node.l + (p.win ? 0 : 1),
        pd: { day: plan.day, o }, recent: [entry, ...node.recent].slice(0, R.LEAGUE_RECENT),
      };
      return after;
    });
    applied[nick] = tx.committed ? p.d : null;
    const node = tx.committed ? after : normalize(tx.value, plan.season);
    await dbSet(`league_pub/${plan.season}/${nick}`, pubRow(nick, node)).catch((e) => console.error("leagues pub failed", e));
  }));
  return { rated: true, applied };
}

// Облік рейтингу не має зривати виплату: гроші вже видано, помилку лише логуємо.
async function safeRate(room, now) {
  try { return await rateRoom(room, now); }
  catch (e) { console.error("leagues rate failed", e); return { rated: false, error: true }; }
}

// ── Екран ──

function view(node, now) {
  const season = R.leagueSeason(now);
  const t = R.leagueTier(node.r);
  const idx = R.leagueTierIdx(node.r);
  const nextT = R.LEAGUE_TIERS[idx + 1] || null;
  return {
    season: { id: season.id, start: season.start, end: season.end }, serverNow: now,
    rating: node.r, tier: t.id, tierName: t.name, games: node.g, wins: node.w, losses: node.l,
    next: nextT ? { id: nextT.id, name: nextT.name, at: nextT.from } : null,
    recent: node.recent, prev: node.prev || null,
    pending: Object.entries(node.pend || {}).sort().map(([s, p]) => {
      const pt = R.LEAGUE_TIERS.find((x) => x.id === p.tier) || R.LEAGUE_TIERS[0];
      return { season: s, tier: pt.id, tierName: pt.name, coins: pt.coins, badge: pt.badge || null };
    }),
  };
}

async function state(nick, now = Date.now()) {
  const season = R.leagueSeason(now).id;
  const cur = await dbGet(nodePath(nick));
  let node = normalize(cur, season);
  // Рубіж сезону — зберігаємо перехід (лише коли вузол уже існує і сезон змінився).
  if (cur && cur.s !== season) {
    const tx = await dbTransaction(nodePath(nick), (c) => (c && c.s !== season ? normalize(c, season) : undefined));
    node = normalize(tx.value, season);
  }
  return { ok: true, ...view(node, now) };
}

// Нагорода за завершені сезони — раз (позначку знімаємо в тій самій транзакції).
async function claim(nick, now = Date.now()) {
  const season = R.leagueSeason(now).id;
  let taken = null;
  const tx = await dbTransaction(nodePath(nick), (cur) => {
    const node = normalize(cur, season);
    taken = node.pend;
    if (!Object.keys(taken).length) { taken = null; return cur && cur.s !== season ? node : undefined; }
    return { ...node, pend: {} };
  });
  if (!taken) return no(409, "nothing", "Нагороди за завершені сезони зараз немає");
  const rows = Object.values(taken).map((p) => R.LEAGUE_TIERS.find((x) => x.id === p.tier) || R.LEAGUE_TIERS[0]);
  const coins = rows.reduce((a, t) => a + t.coins, 0);
  let bal;
  try {
    bal = await moveBalance(nick, coins);
  } catch (e) {
    // Гроші не пройшли — повертаємо нагороду в очікування.
    await dbTransaction(nodePath(nick), (cur) => (cur ? { ...cur, pend: { ...(cur.pend || {}), ...taken } } : undefined)).catch(() => {});
    throw e;
  }
  // Значки — після грошей і без повтору: «займаємо» транзакцією, як у lib/shop.js.
  const badges = [];
  for (const t of rows) {
    if (!t.badge || badges.includes(t.badge)) continue;
    try {
      const c = await dbTransaction(`users/${nick}/slotikyItems/${t.badge}`, (cur) => (cur ? undefined : { boughtAt: now, src: "league" }));
      if (c.committed) badges.push(t.badge);
    } catch (e) { console.error("leagues badge failed", e); }
  }
  return { ok: true, coins, badges, seasons: Object.keys(taken).sort(), balance: bal.balance };
}

module.exports = { normalize, rated, rateRoom, safeRate, state, claim, pubRow };
