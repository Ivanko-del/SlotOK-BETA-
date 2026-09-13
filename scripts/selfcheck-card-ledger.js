// Self-check for the multi-card wallet money routing in app.js: which node a
// card's money lives in (_cardIdsOf / _activeCardIdOf / cardBalancePath), which
// two nodes a card-to-card transfer touches, and which transactions belong to a
// card's feed (ksTxOnCard).
//
// app.js is a monolithic browser script with no module.exports, so these are
// re-declared here in isolation. They are money paths: getting the active card
// wrong credits a deposit, a rejected withdrawal, or a transfer to the WRONG
// card, and getting the feed filter wrong makes a card's balance disagree with
// its own history. If you change them in app.js, mirror the change here.
// Run: node scripts/selfcheck-card-ledger.js
const assert = require("assert");

function _cardIdsOf(u) {
  var ids = [];
  if (u && u.virtualCard && u.virtualCard.axiomLinked) ids.push("axiom");
  if (u && u.linkedCards) Object.keys(u.linkedCards).forEach(function (k) { ids.push(k); });
  return ids;
}
function _activeCardIdOf(u) {
  var ids = _cardIdsOf(u);
  if (!ids.length) return null;
  var a = u && u.activeCardId;
  return (a && ids.indexOf(a) >= 0) ? a : ids[0];
}
function _cardBalPath(id) {
  return id === "axiom" ? "virtualCard/balance" : ("linkedCards/" + id + "/balance");
}
function cardBalancePath(u, cardId) {
  if (!u || !cardId) return "balance";
  if (_cardIdsOf(u).indexOf(cardId) < 0) return "balance";
  if (cardId === _activeCardIdOf(u)) return "balance";
  return _cardBalPath(cardId);
}
function _freezePath(id) { return id === "axiom" ? "virtualCard/frozen" : ("linkedCards/" + id + "/frozen"); }
function isCardFrozenOf(u, id) {
  if (!u || !id) return false;
  if (id === "axiom") return !!(u.virtualCard && u.virtualCard.frozen);
  return !!(u.linkedCards && u.linkedCards[id] && u.linkedCards[id].frozen);
}
function _cardRecOf(u, id) {
  if (!u || !id) return null;
  return id === "axiom" ? (u.virtualCard || null) : ((u.linkedCards && u.linkedCards[id]) || null);
}
function _dayKey(ts) {
  const d = new Date(ts || Date.now());
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
function cardDayLimit(u, id) { return Math.max(0, (_cardRecOf(u, id) || {}).dayLimit || 0); }
function cardSpentToday(u, id) {
  const rec = _cardRecOf(u, id) || {};
  return rec.dayKey === _dayKey() ? (rec.daySpent || 0) : 0;
}
function cardLimitLeft(u, id) {
  const lim = cardDayLimit(u, id);
  return lim > 0 ? Math.max(0, lim - cardSpentToday(u, id)) : Infinity;
}
function ksTxOnCard(t, cardId) { return !t || !t.cardId || !cardId || t.cardId === cardId; }

const noCards = {};
const axiomOnly = { virtualCard: { axiomLinked: true } };
const wallet = {
  virtualCard: { axiomLinked: true },
  linkedCards: { mono1: {}, priv2: {} },
  activeCardId: "priv2",
};

// ── Where a card's money lives ──────────────────────────────────────────────
// A player with no cards has no active card, and money falls back to the shared balance.
assert.strictEqual(_activeCardIdOf(noCards), null);
assert.strictEqual(cardBalancePath(noCards, "mono1"), "balance");
// Axiom counts as a card even though it lives outside linkedCards.
assert.deepStrictEqual(_cardIdsOf(axiomOnly), ["axiom"]);
assert.strictEqual(_activeCardIdOf(axiomOnly), "axiom");
// Explicit activeCardId wins; the live balance IS the active card, so it uses `balance`.
assert.strictEqual(_activeCardIdOf(wallet), "priv2");
assert.strictEqual(cardBalancePath(wallet, "priv2"), "balance");
// Non-active cards keep their own stored balance and must be credited there.
assert.strictEqual(cardBalancePath(wallet, "mono1"), "linkedCards/mono1/balance");
assert.strictEqual(cardBalancePath(wallet, "axiom"), "virtualCard/balance");
// A card removed while the request was pending must not send money nowhere.
assert.strictEqual(cardBalancePath(wallet, "deleted9"), "balance");
// A dangling activeCardId (card removed) falls back to the first real card, and
// that fallback card must then be treated as the live-balance one.
const dangling = { linkedCards: { mono1: {} }, activeCardId: "gone" };
assert.strictEqual(_activeCardIdOf(dangling), "mono1");
assert.strictEqual(cardBalancePath(dangling, "mono1"), "balance");
// Requests submitted before cards existed carry cardId === null.
assert.strictEqual(cardBalancePath(wallet, null), "balance");

// ── Card-to-card transfer touches two distinct nodes ────────────────────────
// Both legs of a transfer go into ONE multi-path update(), so if the two paths
// ever collided only the second increment would survive and the money would
// silently double. Every pair of real cards must resolve to different nodes.
const ids = _cardIdsOf(wallet);
for (const from of ids) {
  for (const to of ids) {
    if (from === to) continue;
    assert.notStrictEqual(
      cardBalancePath(wallet, from),
      cardBalancePath(wallet, to),
      "transfer " + from + " → " + to + " collapsed into one node"
    );
  }
}
// Moving off the active card debits the shared balance and credits the card itself.
assert.strictEqual(cardBalancePath(wallet, "priv2"), "balance");
assert.strictEqual(cardBalancePath(wallet, "axiom"), "virtualCard/balance");
// Between two non-active cards the shared balance must not be touched at all.
assert.strictEqual(cardBalancePath(wallet, "mono1"), "linkedCards/mono1/balance");
assert.notStrictEqual(cardBalancePath(wallet, "mono1"), "balance");

// ── Freeze is per card, not per wallet ──────────────────────────────────────
// Blocking one card must never block the rest of the wallet: before the
// multi-card wallet this was a single account-wide flag, and reusing it would
// have killed every card at once.
const frozenWallet = {
  virtualCard: { axiomLinked: true, frozen: true },
  linkedCards: { mono1: { frozen: true }, priv2: {} },
  activeCardId: "priv2",
};
assert.strictEqual(isCardFrozenOf(frozenWallet, "axiom"), true);
assert.strictEqual(isCardFrozenOf(frozenWallet, "mono1"), true);
// The active card is NOT frozen, so spending must stay allowed.
assert.strictEqual(isCardFrozenOf(frozenWallet, _activeCardIdOf(frozenWallet)), false);
// Unknown / missing ids never read as frozen — a stale id must not lock a player out.
assert.strictEqual(isCardFrozenOf(frozenWallet, "gone"), false);
assert.strictEqual(isCardFrozenOf(frozenWallet, null), false);
assert.strictEqual(isCardFrozenOf(null, "axiom"), false);
// Axiom keeps its flag at the legacy path, so the partner bank stays compatible.
assert.strictEqual(_freezePath("axiom"), "virtualCard/frozen");
assert.strictEqual(_freezePath("mono1"), "linkedCards/mono1/frozen");

// ── Daily card limit ───────────────────────────────────────────────────────
// The limit counter lives on the card and resets by day key rather than by a
// midnight job, so yesterday leftovers must never eat into today allowance.
const today = _dayKey();
const limited = {
  linkedCards: {
    capped:    { dayLimit: 1000, daySpent: 400, dayKey: today },
    stale:     { dayLimit: 1000, daySpent: 900, dayKey: "1999-1-1" },
    unlimited: { daySpent: 5000, dayKey: today },
  },
  activeCardId: "capped",
};
assert.strictEqual(cardLimitLeft(limited, "capped"), 600);
// Yesterday spend is ignored entirely — a new day starts from the full limit.
assert.strictEqual(cardSpentToday(limited, "stale"), 0);
assert.strictEqual(cardLimitLeft(limited, "stale"), 1000);
// No limit set means no ceiling, however much was already spent.
assert.strictEqual(cardLimitLeft(limited, "unlimited"), Infinity);
// An unknown card must not be treated as capped at zero.
assert.strictEqual(cardLimitLeft(limited, "gone"), Infinity);
// Spending exactly the remainder is allowed; one hryvnia more is not.
assert.ok(600 <= cardLimitLeft(limited, "capped"));
assert.ok(!(601 <= cardLimitLeft(limited, "capped")));
// A limit already fully used leaves zero, never a negative allowance.
const drained = { linkedCards: { c: { dayLimit: 500, daySpent: 900, dayKey: today } } };
assert.strictEqual(cardLimitLeft(drained, "c"), 0);

// ── Feed filter ─────────────────────────────────────────────────────────────
// A card shows its own entries…
assert.strictEqual(ksTxOnCard({ cardId: "priv2" }, "priv2"), true);
assert.strictEqual(ksTxOnCard({ cardId: "mono1" }, "priv2"), false);
// …plus pre-wallet entries that were never stamped, so old history never vanishes.
assert.strictEqual(ksTxOnCard({ ts: 1 }, "priv2"), true);
// A player with no card at all still sees everything rather than an empty feed.
assert.strictEqual(ksTxOnCard({ cardId: "mono1" }, null), true);

console.log("OK — card money routing, transfer paths, per-card freeze, daily limits and transaction filtering are correct");
