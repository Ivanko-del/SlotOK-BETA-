// ╔══════════════════════════════════════════════════════════════╗
// ║  Косметика з магазину Слотіків — видно всім гравцям           ║
// ║                                                              ║
// ║  Розмітка лише позначає, чий це нік чи аватар:                ║
// ║    <span data-pn="нік">нік</span>   — колір ніку, табличка,   ║
// ║                                       значок після ніку;      ║
// ║    <img|div data-pa="нік">           — рамка аватара.         ║
// ║  data-pn="@me" / data-pa="@me" — поточний гравець.            ║
// ║  Стиль гравця (що куплено й надіто) підтягується з бази раз   ║
// ║  на кілька хвилин і кешується; MutationObserver сам оформлює  ║
// ║  нові повідомлення в чатах. Каталог — shared/shop.js.         ║
// ╚══════════════════════════════════════════════════════════════╝

const COSMETIC_CLASS = {
  avatar_silver: 'pa-silver', avatar_gold: 'pa-gold', avatar_fire: 'pa-ember',
  avatar_diamond: 'pa-platinum', avatar_cosmic: 'pa-obsidian',
  username_red: 'pn-crimson', username_gold: 'pn-gold', username_rainbow: 'pn-iris',
  name_frame_neon: 'pp-neon', name_frame: 'pp-supreme',
};
const PLAYER_STYLE_TTL = 5 * 60000;
const _playerStyles = new Map(); // нік → { worn, at } | { pending: Promise }

function cosmeticPreviewHtml(it) {
  const cls = COSMETIC_CLASS[it.id] || '';
  if(it.type === 'frame') return `<span class="pa-demo pa ${cls}" aria-hidden="true">${escapeHtml((currentUser || 'S')[0].toUpperCase())}</span>`;
  if(it.type === 'nick') return `<span class="${cls}">${escapeHtml(currentUser || 'Гравець')}</span>`;
  if(it.type === 'plate') return `<span class="${cls}">${escapeHtml(currentUser || 'Гравець')}</span>`;
  return `<span class="pbadge pbadge-lg" aria-hidden="true"><span class="ic i-${it.icon}"></span></span>`;
}

function _styleNick(raw) { return raw === '@me' ? currentUser : raw; }

function _wornFromData(items, chosen) { return resolveCosmetics(items || {}, chosen || {}); }

function getPlayerStyle(nick) {
  if(!nick) return null;
  if(nick === currentUser && userData) return _wornFromData(userData.slotikyItems, userData.cosmetics);
  const c = _playerStyles.get(nick);
  if(c && c.worn && Date.now() - c.at < PLAYER_STYLE_TTL) return c.worn;
  return null;
}

function loadPlayerStyle(nick) {
  const c = _playerStyles.get(nick);
  if(c && c.pending) return c.pending;
  if(!db || !nick || /[.#$[\]/]/.test(nick)) return Promise.resolve(null);
  const p = Promise.all([
    db.ref('users/' + nick + '/slotikyItems').once('value'),
    db.ref('users/' + nick + '/cosmetics').once('value'),
  ]).then(([a, b]) => {
    const worn = _wornFromData(a.val(), b.val());
    _playerStyles.set(nick, { worn, at: Date.now() });
    return worn;
  }).catch(() => { _playerStyles.delete(nick); return null; });
  _playerStyles.set(nick, { pending: p });
  return p;
}

function invalidatePlayerStyle(nick) {
  _playerStyles.delete(nick);
  applyPlayerStyles(document.body);
}

function _applyNick(el, worn) {
  el.classList.remove('pn-crimson', 'pn-gold', 'pn-iris', 'pp-neon', 'pp-supreme');
  if(worn && worn.nick && COSMETIC_CLASS[worn.nick]) el.classList.add(COSMETIC_CLASS[worn.nick]);
  if(worn && worn.plate && COSMETIC_CLASS[worn.plate]) el.classList.add(COSMETIC_CLASS[worn.plate]);
  let badge = el.nextElementSibling && el.nextElementSibling.classList.contains('pbadge') ? el.nextElementSibling : null;
  const it = worn && worn.badge && shopItem(worn.badge);
  if(!it) { if(badge) badge.remove(); return; }
  if(!badge) {
    badge = document.createElement('span');
    badge.className = 'pbadge';
    el.after(badge);
  }
  badge.title = it.name;
  badge.innerHTML = '<span class="ic i-' + it.icon + '" aria-hidden="true"></span>';
}

function _applyAvatar(el, worn) {
  el.classList.remove('pa', 'pa-silver', 'pa-gold', 'pa-ember', 'pa-platinum', 'pa-obsidian');
  if(worn && worn.frame && COSMETIC_CLASS[worn.frame]) el.classList.add('pa', COSMETIC_CLASS[worn.frame]);
}

function applyPlayerStyles(root) {
  if(!root || !root.querySelectorAll) return;
  const els = root.matches && root.matches('[data-pn],[data-pa]') ? [root] : [];
  root.querySelectorAll('[data-pn],[data-pa]').forEach(e => els.push(e));
  const waiting = new Map();
  els.forEach(el => {
    const nick = _styleNick(el.getAttribute('data-pn') || el.getAttribute('data-pa'));
    if(!nick) return;
    const worn = getPlayerStyle(nick);
    if(worn) { el.hasAttribute('data-pn') ? _applyNick(el, worn) : _applyAvatar(el, worn); return; }
    if(!waiting.has(nick)) waiting.set(nick, []);
    waiting.get(nick).push(el);
  });
  waiting.forEach((list, nick) => loadPlayerStyle(nick).then(worn => {
    list.forEach(el => { if(el.isConnected) el.hasAttribute('data-pn') ? _applyNick(el, worn) : _applyAvatar(el, worn); });
  }));
}

// Нові повідомлення в чатах, рядки рейтингів, профілі — оформлюємо самі.
(function watchPlayerStyles() {
  let queued = [];
  let scheduled = false;
  const flush = () => { scheduled = false; const q = queued; queued = []; q.forEach(n => { if(n.isConnected) applyPlayerStyles(n); }); };
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => { if(n.nodeType === 1 && !n.classList.contains('pbadge')) queued.push(n); }));
    if(queued.length && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true });
})();
