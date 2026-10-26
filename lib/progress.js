// Серверний облік прогресу гравця: VIP (totalWagered), Battle Pass (XP, рівні,
// сезони), кешбек, а також видача бонусів і нагород для api/reward.js.
//
// Усі цифри — з shared/rewards.js, того самого файлу, з якого браузер малює
// екрани. Час — серверний: перевести годинник телефона більше нічого не дає.
// Кожна «одноразова» видача (щоденний бонус, нагорода рівня, скриня) спершу
// займає свій прапорець транзакцією, і лише потім платить — тож паралельні
// запити не заберуть ту саму нагороду двічі.

const R = require("../shared/rewards");
const { dbGet, dbSet, dbUpdate, dbPush, dbTransaction } = require("./firebase");
const { moveBalance } = require("./player");

const DAY = 86400000;
const WEEK = 7 * DAY;
const CLAN_RE = /^[A-Za-z0-9_-]{1,64}$/;

const field = (nick, f) => `users/${nick}/${f}`;
const num = (v) => Number(v) || 0;
const incr = (path, by) => dbTransaction(path, (c) => num(c) + by).then((t) => num(t.value));

// Сезон Battle Pass. Прогрес минулого сезону обнуляємо ліниво — при першій
// дії в новому сезоні (як і браузер у addBpXP). Без bpSeason — гравець ще з
// часів до сезонів: його прогрес зараховується в поточний сезон.
async function ensureSeason(nick, now = Date.now()) {
  const season = R.getBpSeasonInfo(now).num;
  const [stored, vip] = await Promise.all([dbGet(field(nick, "bpSeason")), dbGet(field(nick, "bpVip"))]);
  if (stored != null && stored !== season) {
    await dbUpdate(`users/${nick}`, { bpSeason: season, bpXP: 0, bpLevel: 0, bpClaimed: null, bpVip: false, bpBonusClaimed: 0 });
    return { season, isVip: false };
  }
  if (stored == null) await dbSet(field(nick, "bpSeason"), season);
  return { season, isVip: vip === true };
}

// Ставка, яку щойно списав сервер: вейджер (VIP), XP Battle Pass, кешбек.
// Повертає те, що варто показати гравцю (підвищення VIP/рівня).
async function recordWager(nick, amount, now = Date.now()) {
  if (!(amount > 0)) return null;
  const [bp, wagered, clanId, cashbackOff, weekStart] = await Promise.all([
    ensureSeason(nick, now),
    incr(field(nick, "totalWagered"), amount),
    dbGet(field(nick, "clanId")),
    dbGet(field(nick, "cashbackOff")),
    dbGet(field(nick, "cashbackWeekStart")),
  ]);
  const vip = R.getVipLevel(wagered);
  const out = { wager: amount, totalWagered: wagered };
  if (vip.index > R.getVipLevel(wagered - amount).index) out.vipUp = { name: vip.name, icon: vip.icon };

  const xpJob = async () => {
    const xp = Math.floor(amount / 100) * (bp.isVip ? 2 : 1); // 1 XP за 100 ₴, VIP-пропуск — ×2
    if (xp <= 0) return;
    const total = await incr(field(nick, "bpXP"), xp);
    out.bpXP = total;
    const level = R.bpLevelFromXp(total);
    if (level !== R.bpLevelFromXp(total - xp)) {
      await dbSet(field(nick, "bpLevel"), level);
      out.bpLevelUp = level;
    }
  };

  const cashbackJob = async () => {
    if (cashbackOff === true) return;
    let rate = vip.cashback;
    if (typeof clanId === "string" && CLAN_RE.test(clanId)) rate += R.getClanBankTier(num(await dbGet(`clans/${clanId}/bank`))).cashback;
    const perBet = Math.min(Math.floor(amount * rate), R.CASHBACK_MAX_PER_BET);
    if (perBet <= 0) return;
    const newWeek = now - num(weekStart) >= WEEK;
    let grant = 0;
    await dbTransaction(field(nick, "cashbackWeekUsed"), (c) => {
      const used = newWeek ? 0 : num(c);
      grant = Math.min(perBet, Math.max(0, R.CASHBACK_MAX_PER_WEEK - used));
      return grant > 0 || newWeek ? used + grant : undefined;
    });
    if (newWeek) await dbSet(field(nick, "cashbackWeekStart"), now);
    if (grant > 0) {
      await incr(field(nick, "cashbackPending"), grant);
      out.cashback = grant;
    }
  };

  await Promise.all([xpJob(), cashbackJob(), dbSet(field(nick, "lastPlayedAt"), now)]);
  return out;
}

// Облік ставки не має зривати саму гру: баланс уже змінено, тож помилку
// лише логуємо.
async function safeRecordWager(nick, amount) {
  try { return await recordWager(nick, amount); }
  catch (e) { console.error("recordWager failed", e); return null; }
}

// ── Нагороди ─────────────────────────────────────────────────────────
// Кожна функція повертає { ok: true, ...дані } або { ok: false, status, error, message }.
const no = (status, error, message, extra) => ({ ok: false, status, error, message, ...(extra || {}) });

// Одноразовий прапорець: transaction вирішує, чи можна; повертає попереднє значення.
async function take(path, allow, next) {
  let prev = null;
  const t = await dbTransaction(path, (c) => { prev = c; return allow(c) ? next(c) : undefined; });
  return { taken: t.committed, prev };
}

async function claimDaily(nick, now = Date.now()) {
  const t = await take(field(nick, "lastDailyBonus"), (c) => now - num(c) >= R.DAILY_BONUS_MS, () => now);
  if (!t.taken) return no(409, "not_yet", "Щоденний бонус уже забрано", { nextAt: num(t.prev) + R.DAILY_BONUS_MS });
  const [streakRaw, wagered] = await Promise.all([dbGet(field(nick, "dailyStreak")), dbGet(field(nick, "totalWagered"))]);
  const day = num(streakRaw) + 1; // день серії, який забираємо (1…7)
  const vip = R.getVipLevel(num(wagered));
  const amount = Math.floor(R.DAILY_BONUSES[Math.min(day - 1, R.DAILY_BONUSES.length - 1)] * vip.dailyMult);
  const streakBonus = day === 7 ? R.STREAK_7_BONUS : 0;
  const [, bal] = await Promise.all([dbSet(field(nick, "dailyStreak"), day >= 7 ? 0 : day), moveBalance(nick, amount + streakBonus)]);
  return { ok: true, amount, streakBonus, day, vip: { name: vip.name, icon: vip.icon, mult: vip.dailyMult }, balance: bal.balance };
}

async function claimHourly(nick, now = Date.now()) {
  const t = await take(field(nick, "lastHourlyBonus"), (c) => now - num(c) >= R.HOURLY_BONUS_MS, () => now);
  if (!t.taken) return no(409, "not_yet", "Ще не час! Зачекай годину.", { nextAt: num(t.prev) + R.HOURLY_BONUS_MS });
  const vip = R.getVipLevel(num(await dbGet(field(nick, "totalWagered"))));
  const [bal] = await Promise.all([
    moveBalance(nick, vip.hourly),
    dbPush(field(nick, "hourlyHistory"), { amount: vip.hourly, time: now, vip: vip.name }),
  ]);
  return { ok: true, amount: vip.hourly, vip: { name: vip.name, icon: vip.icon }, balance: bal.balance };
}

async function claimCashback(nick) {
  const t = await take(field(nick, "cashbackPending"), (c) => num(c) >= R.CASHBACK_MIN_CLAIM, () => 0);
  if (!t.taken) {
    const pending = num(t.prev);
    return pending > 0
      ? no(409, "too_small", `Мінімум для виплати: ${R.CASHBACK_MIN_CLAIM} ₴. Зараз: ${pending} ₴`, { pending })
      : no(409, "empty", "Немає накопиченого кешбеку", { pending: 0 });
  }
  const amount = num(t.prev);
  const [bal] = await Promise.all([moveBalance(nick, amount), incr(field(nick, "cashbackTotalClaimed"), amount)]);
  return { ok: true, amount, balance: bal.balance };
}

async function claimDailySpin(nick, rng, now = Date.now()) {
  const today = R.todayStrUTC(now);
  const t = await take(field(nick, "dailySpinDate"), (c) => c !== today, () => today);
  if (!t.taken) return no(409, "not_yet", "Вже крутили сьогодні!");
  const index = rng.int(0, R.DAILY_SPIN_PRIZES.length);
  const prize = R.DAILY_SPIN_PRIZES[index];
  const bal = await moveBalance(nick, prize);
  return { ok: true, index, prize, balance: bal.balance };
}

// Бонус повернення рахується від останньої ставки на сервері (lastPlayedAt),
// а не від lastSeen, який пише браузер. Один раз за кожну відсутність.
async function claimWelcomeBack(nick, now = Date.now()) {
  const last = num(await dbGet(field(nick, "lastPlayedAt")));
  const days = last ? Math.floor((now - last) / DAY) : 0;
  if (days < R.WELCOME_BACK_MIN_DAYS) return no(409, "not_eligible", "Бонус повернення зараз недоступний");
  const t = await take(field(nick, "welcomeBackAt"), (c) => !(num(c) > last), () => now);
  if (!t.taken) return no(409, "already", "Бонус повернення вже забрано");
  const amount = R.welcomeBackBonus(days);
  const bal = await moveBalance(nick, amount);
  return { ok: true, amount, days, balance: bal.balance };
}

async function applyReward(nick, reward, now) {
  const add = (f) => incr(field(nick, f), reward.val);
  switch (reward.type) {
    case "balance": return moveBalance(nick, reward.val);
    case "slotiky": return add("slotiky");
    case "freeSlots": return add("freeSlots");
    case "freeFortune": return add("freeFortune");
    case "minesHints": return add("minesHints");
    case "lootbox": return add("lootboxes");
    case "crashInsurance": return dbSet(field(nick, "crashInsurance"), true);
    case "vipBoost": {
      // Буст не коротшає: якщо вже діє довший — лишаємо його.
      const path = field(nick, "slotikyItems/vip_boost_7d");
      const cur = (await dbGet(path)) || {};
      return dbSet(path, { boughtAt: now, expires: Math.max(num(cur.expires), now + reward.val * DAY) });
    }
    case "cosmetic": return dbSet(field(nick, `slotikyItems/${reward.val}`), { boughtAt: now });
    default: throw new Error("unknown reward type " + reward.type);
  }
}

async function claimBpReward(nick, lv, track, now = Date.now()) {
  const row = R.BP_REWARDS.find((r) => r.lv === lv);
  if (!row || (track !== "f" && track !== "v")) return no(400, "bad_reward", "Невідома нагорода");
  const bp = await ensureSeason(nick, now);
  if (track === "v" && !bp.isVip) return no(403, "need_vip", "❌ Потрібен VIP Battle Pass!");
  if (lv > R.bpLevelFromXp(await dbGet(field(nick, "bpXP")))) return no(409, "locked", "❌ Рівень ще не досягнуто!");
  const t = await take(field(nick, `bpClaimed/${track}${lv}`), (c) => !c, () => true);
  if (!t.taken) return no(409, "already", "Вже отримано!");
  const reward = track === "f" ? row.free : row.vip;
  await applyReward(nick, reward, now);
  return { ok: true, reward: { icon: reward.icon, label: reward.label, type: reward.type } };
}

async function claimBpBonus(nick, now = Date.now()) {
  const bp = await ensureSeason(nick, now);
  const xp = num(await dbGet(field(nick, "bpXP")));
  const earned = R.bpLevelFromXp(xp) >= R.BP_MAX_LEVEL
    ? Math.floor(Math.max(0, xp - R.BP_MAX_LEVEL * R.BP_XP_PER_LEVEL) / R.BP_BONUS_XP) : 0;
  const t = await take(field(nick, "bpBonusClaimed"), (c) => num(c) < earned, (c) => num(c) + 1);
  if (!t.taken) return no(409, "none", "Поки немає бонусних скринь");
  await Promise.all([incr(field(nick, "lootboxes"), 1), bp.isVip ? incr(field(nick, "slotiky"), 2) : null]);
  return { ok: true, lootboxes: 1, slotiky: bp.isVip ? 2 : 0 };
}

async function buyBpVip(nick, now = Date.now()) {
  const bp = await ensureSeason(nick, now);
  if (bp.isVip) return no(409, "already", "VIP Battle Pass уже активний");
  const price = R.BP_VIP_PRICE_SLOTIKY;
  const t = await take(field(nick, "slotiky"), (c) => num(c) >= price, (c) => num(c) - price);
  if (!t.taken) return no(402, "insufficient", `❌ Потрібно ${price} 🪙 Слотіків. У вас: ${num(t.prev)}`);
  await dbUpdate(`users/${nick}`, { bpVip: true, bpVipBoughtAt: now, bpVipMethod: "slotiky", bpSeason: bp.season });
  return { ok: true, slotiky: num(t.prev) - price };
}

module.exports = {
  ensureSeason, recordWager, safeRecordWager,
  claimDaily, claimHourly, claimCashback, claimDailySpin, claimWelcomeBack,
  claimBpReward, claimBpBonus, buyBpVip,
};
