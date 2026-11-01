// Магазин Слотіків на сервері (через api/reward.js): купівля Слотіків за ₴,
// товарів за Слотіки, відкриття скринь і разове повернення Слотіків за
// прибрані товари. Каталог і ціни — shared/shop.js, той самий файл, що малює
// браузер. Кожне списання — транзакція, тож подвійний тап не купить двічі
// і не відкриє одну скриню двічі.

const S = require("../shared/shop");
const { dbGet, dbSet, dbUpdate, dbPush, dbTransaction } = require("./firebase");
const { moveBalance } = require("./player");

const DAY = 86400000;
const field = (nick, f) => `users/${nick}/${f}`;
const num = (v) => Number(v) || 0;
const no = (status, error, message, extra) => ({ ok: false, status, error, message, ...(extra || {}) });

async function takeSlotiky(nick, price) {
  let prev = 0;
  const t = await dbTransaction(field(nick, "slotiky"), (c) => {
    prev = num(c);
    return prev >= price ? prev - price : undefined;
  });
  return { ok: t.committed, prev, left: t.committed ? prev - price : prev };
}

async function buySlotiky(nick, n) {
  const pack = S.SLOTIKY_PACKS.find((p) => p.n === n);
  if (!pack) return no(400, "bad_pack", "Невідомий пакет");
  const debit = await moveBalance(nick, -pack.price);
  if (!debit.ok) return no(402, "insufficient", "Недостатньо коштів", { balance: debit.balance });
  const t = await dbTransaction(field(nick, "slotiky"), (c) => num(c) + pack.n);
  await dbPush(field(nick, "history"), { text: `Куплено ${pack.n} Слотік(ів): -${pack.price}₴`, date: Date.now() });
  return { ok: true, n: pack.n, price: pack.price, slotiky: num(t.value), balance: debit.balance };
}

async function buyItem(nick, id, now = Date.now()) {
  const it = S.shopItem(id);
  if (!it) return no(400, "bad_item", "Такого товару немає");
  const path = field(nick, `slotikyItems/${id}`);
  const isCosmetic = S.COSMETIC_SLOTS.includes(it.type);
  // Косметику спершу «займаємо» транзакцією — два паралельні тапи не куплять її двічі.
  if (isCosmetic) {
    const claim = await dbTransaction(path, (c) => (c ? undefined : { boughtAt: now }));
    if (!claim.committed) return no(409, "owned", "Вже придбано");
  }
  const pay = await takeSlotiky(nick, it.price);
  if (!pay.ok) {
    if (isCosmetic) await dbSet(path, null);
    return no(402, "insufficient", `Потрібно ${it.price} Слотік(ів). У вас: ${pay.prev}`, { slotiky: pay.prev });
  }

  const out = { ok: true, id, slotiky: pay.left };
  if (isCosmetic) {
    // уже записано вище
  } else if (it.type === "boost") {
    // Повторна купівля продовжує, а не перезапускає.
    const cur = (await dbGet(path)) || {};
    const from = Math.max(num(cur.expires), now);
    out.expires = from + it.days * DAY;
    await dbSet(path, { boughtAt: now, expires: out.expires });
  } else {
    const t = await dbTransaction(field(nick, it.counter), (c) => num(c) + it.qty);
    out.count = num(t.value);
    await dbSet(path, { boughtAt: now });
  }
  await dbTransaction(field(nick, "slotikySpent"), (c) => num(c) + it.price);
  return out;
}

async function openBox(nick, tier, rng) {
  const box = S.SHOP_BOXES[tier];
  if (!box) return no(400, "bad_box", "Невідома скриня");
  const t = await dbTransaction(field(nick, `lootboxInv/${tier}`), (c) => (num(c) > 0 ? num(c) - 1 : undefined));
  if (!t.committed) return no(409, "none", "Таких скринь немає");
  const total = box.prizes.reduce((s, p) => s + p.weight, 0);
  let r = rng.int(0, total);
  let prize = box.prizes[box.prizes.length - 1];
  for (const p of box.prizes) { if (r < p.weight) { prize = p; break; } r -= p.weight; }
  const win = Math.floor(box.value * prize.mult);
  const bal = await moveBalance(nick, win);
  await Promise.all([
    dbPush(field(nick, "lootboxHistory"), { type: "shop_" + tier, win, price: box.value, time: Date.now() }),
    dbPush(field(nick, "history"), { text: `${box.name}: +${win}₴`, date: Date.now() }),
    dbTransaction(field(nick, "lootboxesOpened"), (c) => num(c) + 1),
  ]);
  return { ok: true, tier, mult: prize.mult, win, left: num(t.value), balance: bal.balance };
}

// Разово (прапорець shopV2): повертає Слотіки за прибрані товари й ефекти
// профілю, переносить старий лічильник скринь Battle Pass і булеву страховку
// Крашу в нові лічильники.
async function migrate(nick) {
  let first = false;
  await dbTransaction(field(nick, "shopV2"), (c) => { first = !c; return c ? undefined : Date.now(); });
  if (!first) return { ok: true, refund: 0 };
  const [items, effect, oldBoxes, insurance] = await Promise.all([
    dbGet(field(nick, "slotikyItems")),
    dbGet(field(nick, "profileEffect")),
    dbGet(field(nick, "lootboxes")),
    dbGet(field(nick, "crashInsurance")),
  ]);
  let refund = 0;
  const upd = {};
  for (const id of Object.keys(items || {})) {
    if (S.SHOP_REMOVED[id]) { refund += S.SHOP_REMOVED[id]; upd[`slotikyItems/${id}`] = null; }
  }
  if (effect && S.PROFILE_EFFECT_REFUND[effect]) refund += S.PROFILE_EFFECT_REFUND[effect];
  if (effect) upd.profileEffect = null;
  if (num(oldBoxes) > 0) upd.lootboxes = null;
  if (insurance === true) upd.crashInsurance = 1;
  if (Object.keys(upd).length) await dbUpdate(`users/${nick}`, upd);
  if (num(oldBoxes) > 0) await dbTransaction(field(nick, "lootboxInv/bp"), (c) => num(c) + num(oldBoxes));
  if (refund > 0) {
    await dbTransaction(field(nick, "slotiky"), (c) => num(c) + refund);
    await dbPush(field(nick, "history"), { text: `Повернення за прибрані товари магазину: +${refund} Слотік(ів)`, date: Date.now() });
  }
  return { ok: true, refund };
}

// Активні множники бустів гравця (для lib/progress.js).
async function effectsOf(nick, now = Date.now()) {
  return S.boostEffects(await dbGet(field(nick, "slotikyItems")), now);
}

module.exports = { buySlotiky, buyItem, openBox, migrate, effectsOf };
