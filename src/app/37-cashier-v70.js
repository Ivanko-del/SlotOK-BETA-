// ╔══════════════════════════════════════════════════════════════╗
// ║  КАСА v70 — 3D КАРТКА + ТИМЧАСОВА КАРТКА ПАРТНЕРА          ║
// ╚══════════════════════════════════════════════════════════════╝

// ── 3D CARD TOUCH TILT ────────────────────────────────────────
var _cardTouchStart = null;
var _cardTouchMoved = false;
var _cardTiltInterval = null;

// Світло-відблиск (--lx/--ly на .vcard-front) рахуємо з того ж кута нахилу,
// яким крутимо картку — світло "рухається" по картці протилежно нахилу,
// саме так реальний пластик/метал відбиває фіксоване джерело світла зверху
function _updateCardLight(dx, dy) {
  var front = document.querySelector('#vcardEl .vcard-front');
  if(!front) return;
  var lx = 50 - (dx / 15) * 40; // dx∈[-15,15] → lx∈[10,90]
  var ly = 50 - (dy / 10) * 45; // dy∈[-10,10] → ly∈[5,95]
  front.style.setProperty('--lx', lx + '%');
  front.style.setProperty('--ly', ly + '%');
  front.style.setProperty('--light-op', String(Math.min(1, .45 + (Math.abs(dx) + Math.abs(dy)) / 30)));
}
function _resetCardLight() {
  var front = document.querySelector('#vcardEl .vcard-front');
  if(!front) return;
  front.style.removeProperty('--lx');
  front.style.removeProperty('--ly');
  front.style.removeProperty('--light-op');
}
function handleCardTouchStart(e) {
  var t = e.touches[0];
  _cardTouchStart = { x: t.clientX, y: t.clientY };
  _cardTouchMoved = false;
}
function handleCardTouchMove(e) {
  if(!_cardTouchStart) return;
  var wrap = document.getElementById('vcardWrap');
  if(!wrap || wrap.classList.contains('flipped')) return;
  var t = e.touches[0];
  var rawDx = t.clientX - _cardTouchStart.x;
  var rawDy = t.clientY - _cardTouchStart.y;
  // Only take over the gesture (and block page scroll) once the
  // finger has moved enough to be a deliberate tilt, not a tap
  if(!_cardTouchMoved && Math.abs(rawDx) < 4 && Math.abs(rawDy) < 4) return;
  _cardTouchMoved = true;
  e.preventDefault(); // stop page from scrolling while tilting the card
  var dx = rawDx / 8;
  var dy = -rawDy / 8;
  dx = Math.max(-15, Math.min(15, dx));
  dy = Math.max(-10, Math.min(10, dy));
  wrap.style.transition = 'transform 0.1s';
  wrap.style.transform = 'rotateY(' + dx + 'deg) rotateX(' + dy + 'deg)';
  _updateCardLight(dx, dy);
}
function handleCardTouchEnd(e) {
  _cardTouchStart = null;
  _cardTouchMoved = false;
  var wrap = document.getElementById('vcardWrap');
  if(!wrap || wrap.classList.contains('flipped')) return;
  wrap.style.transition = 'transform 0.6s cubic-bezier(0.4,0,0.2,1)';
  wrap.style.transform = '';
  _resetCardLight();
}
// Desktop — той самий трюк через мишу, замість статичного CSS :hover нахилу
(function initCardMouseTilt() {
  if(!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.addEventListener('DOMContentLoaded', function() {
    var wrap = document.getElementById('vcardWrap');
    if(!wrap) return;
    wrap.addEventListener('mousemove', function(e) {
      if(wrap.classList.contains('flipped')) return;
      var r = wrap.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      var dx = (px - 0.5) * 24;
      var dy = (0.5 - py) * 16;
      wrap.style.transition = 'transform 0.08s linear';
      wrap.style.transform = 'scale(1.015) rotateY(' + dx + 'deg) rotateX(' + dy + 'deg)';
      _updateCardLight(dx, dy);
    });
    wrap.addEventListener('mouseleave', function() {
      wrap.style.transition = 'transform 0.5s cubic-bezier(0.22,1,.36,1)';
      wrap.style.transform = '';
      _resetCardLight();
    });
  });
})();

function flipCard() {
  var wrap = document.getElementById('vcardWrap');
  if(!wrap) return;
  wrap.classList.toggle('flipped');
  if(navigator.vibrate) navigator.vibrate(30);
}

function copyCardNumberFlash(e) {
  if(e) e.stopPropagation();
  var numEl = document.getElementById('vcardNumber');
  var num = numEl ? numEl.textContent.replace(/\s/g,'') : '';
  if(!/^[0-9]{12,19}$/.test(num)) return notify(hasConnectedCard()
    ? 'Повний номер картки зберігається у вашому банку, не в SlotOK'
    : 'Спочатку підключіть картку в Касі', 'error');
  navigator.clipboard && navigator.clipboard.writeText(num).then(function() {
    notify('📋 Номер скопійовано!', 'success');
    if(numEl) { numEl.classList.add('copied'); setTimeout(function(){ numEl.classList.remove('copied'); }, 600); }
    if(navigator.vibrate) navigator.vibrate([40,20,40]);
  });
}

function toggleCvvVisibility() {
  var btn = document.getElementById('cvvToggleBtn');
  var cvvFront = document.getElementById('vcardCvvDisplay');
  var cvvBack  = document.getElementById('vcardCvvBack');
  // CVV є лише в прив'язаної картки Аксіоми. Свої зовнішні картки ми
  // зберігаємо замасковано й CVV не приймаємо взагалі — тому тут нічого
  // показувати, і про це треба сказати прямо, а не мовчки нічого не робити.
  var card = getActiveCard();
  if(!card) return notify(hasConnectedCard()
    ? 'CVV своєї картки SlotOK не зберігає — дивіться його на самій картці'
    : 'Спочатку підключіть картку в Касі', 'error');
  var cvv = card.cvv || '•••';
  var hidden = cvvFront && cvvFront.textContent === '•••';
  if(cvvFront) cvvFront.textContent = hidden ? cvv : '•••';
  if(cvvBack)  cvvBack.textContent  = hidden ? cvv : '•••';
  if(btn) btn.innerHTML = hidden ? (ksIcon('eyeOff') + ' Приховати') : (ksIcon('eye') + ' CVV');
}

// ═══════════════════════════════════════════════════════════════════
// КАСА v80 — ІКОНКИ
// Штрихові SVG замість емодзі: одна мова іконок на всю Касу, у кольорі
// currentColor, щоб успадковувати стан елемента (активний / вимкнений).
// ═══════════════════════════════════════════════════════════════════
var KS_ICON_PATHS = {
  card:    '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  bank:    '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9.5 21v-6h5v6"/>',
  down:    '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  up:      '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  send:    '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  trend:   '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.2" r="1.2"/><circle cx="15" cy="9.2" r="1.2"/><circle cx="9.8" cy="15" r="1.2"/>',
  lock:    '<rect x="3.5" y="11" width="17" height="10.5" rx="2.5"/><path d="M7.5 11V7a4.5 4.5 0 0 1 9 0v4"/>',
  unlock:  '<rect x="3.5" y="11" width="17" height="10.5" rx="2.5"/><path d="M7.5 11V7a4.5 4.5 0 0 1 8.9-1"/>',
  dice:    '<rect x="3" y="3" width="18" height="18" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.15"/><circle cx="12" cy="12" r="1.15"/><circle cx="15.5" cy="15.5" r="1.15"/>',
  eye:     '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:  '<path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.3 6.7A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.8"/><path d="m3 3 18 18"/>',
  copy:    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus:    '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x:       '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  trash:   '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/>',
  inflow:  '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  outflow: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  swap:    '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>',
  gift:    '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 13h18"/>',
  shield:  '<path d="M12 3l8 3v6c0 4.5-3.3 8.3-8 9-4.7-.7-8-4.5-8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  check:   '<path d="M20 6 9 17l-5-5"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
};
function ksIcon(name, size) {
  var d = KS_ICON_PATHS[name];
  if(!d) return '';
  var st = size ? ' style="width:' + size + 'px;height:' + size + 'px;"' : '';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"' + st + '>' + d + '</svg>';
}
function ksEsc(str) {
  return String(str == null ? '' : str)
    // Апостроф теж: значення з ksEsc() підставляються в onclick="fn('…')",
    // де сирий ' обірвав би аргумент і зламав обробник.
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ═══════════════════════════════════════════════════════════════════
// ПІДКЛЮЧЕНІ КАРТКИ
// SlotOK не випускає власних карток — ні тимчасових, ні постійних.
// У Касі показується лише та картка, яку гравець підключив сам:
//   • своя картка свого банку — зберігаємо ТІЛЬКИ банк, ім'я власника,
//     останні 4 цифри й термін дії. Повний номер і CVV не приймаємо
//     й не пишемо в базу взагалі;
//   • картка Аксіома Банку — приходить через 6-значний код і має повні
//     дані, бо їх видає сам банк-партнер.
// ═══════════════════════════════════════════════════════════════════
var KS_BANKS = {
  privat: { name: 'PrivatBank',        color: '#4caf50', short: 'П'  },
  mono:   { name: 'Monobank',          color: '#1c1c1c', short: 'М'  },
  visa:   { name: 'Visa / Mastercard', color: '#1a1f71', short: 'VM' },
  partner:{ name: 'Партнер Банк',      color: '#4a9eff', short: 'PB' },
  abank:  { name: 'A-Bank',            color: '#e2333a', short: 'A'  },
  sense:  { name: 'Sense Bank',        color: '#7b3fe4', short: 'S'  },
  pumb:   { name: 'ПУМБ',              color: '#c8102e', short: 'ПБ' },
  oschad: { name: 'Ощадбанк',          color: '#0f8a4a', short: 'О'  },
  other:  { name: 'Інший банк',        color: '#3b4252', short: '•'  },
};

function getLinkedCards() {
  if(!userData) return [];
  var out = [];
  var activeId = getActiveCardId();
  var vc = userData.virtualCard;
  if(vc && vc.axiomLinked) {
    out.push({
      id: 'axiom', kind: 'axiom', bank: 'axiom', bankName: 'Аксіома Банк',
      mark: 'А', markColor: '#5c6ef8',
      holder: String(vc.holder || currentUser || '').toUpperCase(),
      last4: String(vc.number || '').replace(/\D/g,'').slice(-4) || '••••',
      number: vc.number, cvv: vc.cvv, expiry: vc.expiry || '',
      addedAt: vc.axiomLinkedAt || 0, storedBalance: vc.balance || 0, frozen: !!vc.frozen,
      skin: vc.skin || '', customPhotoUrl: vc.customPhotoUrl || '',
    });
  }
  var linked = userData.linkedCards || {};
  Object.keys(linked).forEach(function(id) {
    var c = linked[id] || {};
    var b = KS_BANKS[c.bank] || KS_BANKS.other;
    // Партнер-картка, згенерована самим SlotOK, має повні дані (номер + CVV)
    // і 30-денний термін; звичайна підключена картка — лише маску.
    var gen = !!c.generated;
    out.push({
      id: id, kind: gen ? 'partner' : 'external', bank: c.bank || 'other', bankName: b.name,
      mark: b.short, markColor: b.color,
      holder: String(c.holder || '').toUpperCase(),
      last4: c.last4 || (c.number ? String(c.number).replace(/\D/g,'').slice(-4) : '••••'),
      number: c.number || '', cvv: c.cvv || '', expiry: c.expiry || '',
      addedAt: c.addedAt || 0, generated: gen, expiresAt: c.expiresAt || 0,
      storedBalance: c.balance || 0, frozen: !!c.frozen,
      skin: c.skin || '', customPhotoUrl: c.customPhotoUrl || '',
    });
  });
  // Позначаємо активну картку та підставляємо їй ЖИВИЙ баланс (userData.balance),
  // решті — збережений на картці. Активною за замовчуванням є перша.
  out.forEach(function(c) { c.active = (c.id === activeId); c.balance = c.active ? (userData.balance || 0) : c.storedBalance; });
  return out;
}
function hasConnectedCard() { return getLinkedCards().length > 0; }

// ═══════════════════════════════════════════════════════════════════
// АКТИВНА КАРТКА — джерело коштів для ігор, поповнення, виводу, переказу.
// Проєкційна модель: userData.balance ЗАВЖДИ дорівнює балансу активної
// картки, тож ігри пишуть у balance як і раніше, нічого не знаючи про картки.
// Баланс кожної картки зберігається окремо (linkedCards/<id>/balance або
// virtualCard/balance для Аксіоми) й авторитетний лише поки картка НЕ активна;
// в активної живий баланс — це userData.balance.
// ═══════════════════════════════════════════════════════════════════
function _cardIdsOf(u) {
  var ids = [];
  if(u && u.virtualCard && u.virtualCard.axiomLinked) ids.push('axiom');
  if(u && u.linkedCards) Object.keys(u.linkedCards).forEach(function(k){ ids.push(k); });
  return ids;
}
// Активну картку рахуємо не лише для себе: адмінка зараховує депозит і повертає
// відхилений вивід ЧУЖОМУ акаунту й мусить визначати її точно так само.
function _activeCardIdOf(u) {
  var ids = _cardIdsOf(u);
  if(!ids.length) return null;
  var a = u && u.activeCardId;
  return (a && ids.indexOf(a) >= 0) ? a : ids[0];
}
function _rawCardIds()   { return _cardIdsOf(userData); }
function getActiveCardId() { return _activeCardIdOf(userData); }
function getActiveCardObj() {
  var id = getActiveCardId();
  if(!id) return null;
  var cards = getLinkedCards();
  for(var i=0;i<cards.length;i++) if(cards[i].id === id) return cards[i];
  return null;
}
// Аксіома тримає свої поля у virtualCard/, підключені картки — у своєму записі.
// Один шлях на всі поля, щоб баланс, заморозка й ліміт не розповзались по трьох
// різних уявленнях про те, де що лежить.
function _cardFieldPath(id, field) { return (id === 'axiom' ? 'virtualCard/' : 'linkedCards/' + id + '/') + field; }
function _cardRecOf(u, id) {
  if(!u || !id) return null;
  return id === 'axiom' ? (u.virtualCard || null) : ((u.linkedCards && u.linkedCards[id]) || null);
}
function _cardBalPath(id) { return _cardFieldPath(id, 'balance'); }

// ── Заморозка ────────────────────────────────────────────────────
// Блокування — властивість однієї картки, а не всього гаманця: заблокував
// Приват, Аксіома далі працює. Аксіома тримає прапорець там само, де й раніше
// (virtualCard/frozen), тож стан, який синхронізує банк-партнер, лишається
// сумісним; підключені картки тримають свій на собі.
function _freezePath(id) { return _cardFieldPath(id, 'frozen'); }
function isCardFrozenOf(u, id) { return !!(_cardRecOf(u, id) || {}).frozen; }
function isCardFrozen(id) { return isCardFrozenOf(userData, id); }
// Гроші завжди йдуть з активної картки, тож усі перевірки списання питають саме її.
function isActiveCardFrozen() { return isCardFrozen(getActiveCardId()); }

// До мульти-карткового гаманця заморозка була одна на акаунт і лежала в
// virtualCard/frozen. Хто заморозився тоді, мав на увазі «всі картки» — тож
// переносимо прапорець на кожну, а не тихо розморожуємо решту.
function migrateCardFreeze() {
  if(!db || !currentUser || !userData || userData.freezeMigrated) return;
  var updates = { freezeMigrated: true };
  if(userData.virtualCard && userData.virtualCard.frozen) {
    Object.keys(userData.linkedCards || {}).forEach(function(id) {
      updates['linkedCards/' + id + '/frozen'] = true;
      userData.linkedCards[id].frozen = true;
    });
  }
  userData.freezeMigrated = true;
  db.ref('users/' + currentUser).update(updates);
}
function _storedBalOf(id) {
  if(id === 'axiom') return (userData.virtualCard && userData.virtualCard.balance) || 0;
  return (userData.linkedCards && userData.linkedCards[id] && userData.linkedCards[id].balance) || 0;
}

// Перемикання активної картки. Живий баланс старої картки зберігається назад
// на неї, баланс нової підвантажується в userData.balance — одним атомарним
// update, щоб гроші не могли загубитись між записами.
function switchActiveCard(id) {
  if(!db || !currentUser || !userData) return;
  var ids = _rawCardIds();
  if(ids.indexOf(id) < 0) return;
  var cur = getActiveCardId();
  if(id === cur) return;
  var liveBal = userData.balance || 0;
  var newBal = _storedBalOf(id);
  var updates = {};
  if(cur) updates[_cardBalPath(cur)] = liveBal;   // зберегти живий баланс старої активної
  updates['balance'] = newBal;                    // підвантажити баланс нової
  updates['activeCardId'] = id;
  // локально теж — щоб UI не блимав старими значеннями до відповіді Firebase
  if(cur === 'axiom' && userData.virtualCard) userData.virtualCard.balance = liveBal;
  else if(cur && userData.linkedCards && userData.linkedCards[cur]) userData.linkedCards[cur].balance = liveBal;
  userData.balance = newBal;
  userData.activeCardId = id;
  db.ref('users/' + currentUser).update(updates);
  var obj = getActiveCardObj();
  notify('Активна картка: ' + (obj ? obj.bankName + ' ····' + obj.last4 : '—'), 'success');
  if(navigator.vibrate) navigator.vibrate(20);
  renderCardPanel();
  renderSourceBars();
}

// Перша підключена/згенерована картка успадковує наявний баланс гравця, щоб
// гроші не подвоїлись і не зникли; наступні стартують з нуля.
function _adoptOrZeroBalance(newId, recRef) {
  var hadCards = _rawCardIds().filter(function(x){ return x !== newId; }).length > 0;
  if(hadCards) {
    // вже є активна картка — нова стартує з 0
    if(recRef) recRef.child('balance').set(0);
  } else {
    // перша картка — стає активною й переймає поточний баланс
    var bal = userData.balance || 0;
    if(recRef) recRef.child('balance').set(bal);
    db.ref('users/' + currentUser + '/activeCardId').set(newId);
    userData.activeCardId = newId;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ДЕННИЙ ЛІМІТ КАРТКИ
// Ліміт банківський, а не ігровий: рахує гроші, що йдуть З картки НАЗОВНІ —
// вивід, переказ гравцю, подарунок, купівля крипти, перекид на іншу картку.
// Програші в іграх сюди НЕ входять: за них відповідає «Відповідальна гра»
// (userData.rgLimits), і дублювати її лічильником на кожну ставку — зайвий
// запис у базу на кожен спін.
// Лічильник живе на самій картці й скидається першою ж операцією нового дня,
// тож окремого «обнулення опівночі» не потрібно.
// ═══════════════════════════════════════════════════════════════════
var CARD_LIMIT_PRESETS = [0, 500, 1000, 2000, 5000, 10000];

function _dayKey(ts) {
  var d = new Date(ts || Date.now());
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function cardDayLimit(id) { return Math.max(0, (_cardRecOf(userData, id) || {}).dayLimit || 0); }
function cardSpentToday(id) {
  var rec = _cardRecOf(userData, id) || {};
  return rec.dayKey === _dayKey() ? (rec.daySpent || 0) : 0;
}
function cardLimitLeft(id) {
  var lim = cardDayLimit(id);
  return lim > 0 ? Math.max(0, lim - cardSpentToday(id)) : Infinity;
}
// Повертає true, якщо операцію можна проводити; інакше сама пояснює гравцю, чому ні.
function checkCardLimit(id, amount) {
  if(!id || !amount) return true;
  var left = cardLimitLeft(id);
  if(amount <= left) return true;
  notify('Денний ліміт картки вичерпано — сьогодні лишилось ' + formatNumber(left) + ' ₴', 'error');
  return false;
}
// Викликається ПІСЛЯ успішного списання: зайвий інкремент забрав би в гравця
// ліміт за операцію, яка не відбулась.
function noteCardSpend(id, amount) {
  if(!db || !currentUser || !id || !amount) return;
  if(cardDayLimit(id) <= 0) return;   // без ліміту нема чого рахувати
  var key = _dayKey();
  var spent = cardSpentToday(id) + amount;
  var rec = _cardRecOf(userData, id);
  if(rec) { rec.dayKey = key; rec.daySpent = spent; }
  var updates = {};
  updates[_cardFieldPath(id, 'dayKey')]   = key;
  updates[_cardFieldPath(id, 'daySpent')] = spent;
  db.ref('users/' + currentUser).update(updates);
}

function openCardLimitModal() {
  var card = getActiveCardObj();
  if(!card) return notify('Спочатку підключіть картку в Касі', 'error');
  var old = document.getElementById('ksLimitModal'); if(old) old.remove();
  var cur = cardDayLimit(card.id);
  var m = document.createElement('div');
  m.className = 'ks-modal'; m.id = 'ksLimitModal';
  m.addEventListener('click', function(e){ if(e.target === m) m.remove(); });
  m.innerHTML = '<div class="ks-modal-box">' +
    '<div class="ks-modal-head"><div class="ks-modal-title">Денний ліміт · ····' + ksEsc(card.last4) + '</div>' +
      '<button class="ks-modal-x" onclick="document.getElementById(\'ksLimitModal\').remove()">' + ksIcon('x') + '</button></div>' +
    '<p class="ks-hint" style="margin:0 0 14px;">Обмежує, скільки за добу може піти з цієї картки на вивід, перекази, подарунки й купівлю крипти. ' +
      'Ставки він не чіпає — для гри є <b>Відповідальна гра</b> в Налаштуваннях.</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">' +
      CARD_LIMIT_PRESETS.map(function(v) {
        return '<button class="ks-btn is-sm' + (v === cur ? ' is-primary' : ' is-quiet') + '" style="flex:1 1 30%;" ' +
          'onclick="setCardDayLimit(' + v + ')">' + (v === 0 ? 'Без ліміту' : formatNumber(v) + ' ₴') + '</button>';
      }).join('') +
    '</div>' +
    '<div class="ks-label">Своя сума</div>' +
    '<input id="ksLimitAmt" type="number" inputmode="numeric" min="0" placeholder="' + (cur || 0) + '" style="margin-bottom:10px;">' +
    '<button class="ks-btn is-primary is-block" onclick="setCardDayLimit(Math.floor(parseFloat((document.getElementById(\'ksLimitAmt\')||{}).value)) || 0)">Зберегти</button>' +
    '</div>';
  document.body.appendChild(m);
}

function setCardDayLimit(v) {
  var card = getActiveCardObj();
  if(!card) return;
  v = Math.max(0, Math.floor(v) || 0);
  var rec = _cardRecOf(userData, card.id);
  if(rec) rec.dayLimit = v;
  db.ref('users/' + currentUser + '/' + _cardFieldPath(card.id, 'dayLimit')).set(v);
  notify(v ? ('Денний ліміт картки ····' + card.last4 + ': ' + formatNumber(v) + ' ₴') : 'Денний ліміт знято', 'success');
  var m = document.getElementById('ksLimitModal'); if(m) m.remove();
  renderCardPanel();
}

// Перевірка Луна — та сама, якою користуються справжні платіжні системи.
// Ловить описки в номері ДО того, як гравець вирішить, що Каса зламана.
function ksLuhn(digits) {
  if(!/^[0-9]{12,19}$/.test(digits)) return false;
  var sum = 0, dbl = false;
  for(var i = digits.length - 1; i >= 0; i--) {
    var d = digits.charCodeAt(i) - 48;
    if(dbl) { d *= 2; if(d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

function renderLinkedCards() {
  var el = document.getElementById('linkedCardsList');
  if(!el) return;
  var cards = getLinkedCards();
  var moveBtn = document.getElementById('cardMoveBtn');
  if(moveBtn) moveBtn.hidden = cards.length < 2;
  if(!cards.length) {
    el.innerHTML =
      '<div class="ks-empty" style="padding:22px 18px;">' +
        '<div class="ks-empty-text" style="margin-bottom:16px;">Поки що не підключено жодної картки. ' +
          'Підключіть свою, згенеруйте Партнер-картку або прив\'яжіть Аксіому.</div>' +
        '<div class="ks-btn-row" style="margin-bottom:8px;">' +
          '<button class="ks-btn is-primary" onclick="openAddCardModal()">' + ksIcon('plus') + ' Своя картка</button>' +
          '<button class="ks-btn" onclick="createPartnerCard()">' + ksIcon('card') + ' Партнер</button>' +
        '</div>' +
        '<button class="ks-btn is-quiet is-block" onclick="openAxiomLinkFlow()">' + ksIcon('bank') + ' Прив\'язати Аксіому</button>' +
      '</div>';
    return;
  }
  el.innerHTML = cards.map(function(c) {
    var expired = c.kind === 'partner' && c.expiresAt && c.expiresAt < Date.now();
    var badge = c.frozen ? '<span class="ks-badge is-neg">Заблокована</span>'
              : c.active ? '<span class="ks-badge is-pos">Активна</span>' : '';
    var act = '';
    if(expired) act += '<button class="ks-copy-btn" style="width:auto;padding:0 10px;color:var(--ks-acc);" data-id="' + ksEsc(c.id) + '" onclick="event.stopPropagation();renewPartnerCard(this.getAttribute(\'data-id\'))" title="Продовжити на 30 днів">' + ksIcon('clock') + '</button>';
    if(c.kind !== 'axiom') act += '<button class="ks-copy-btn" data-id="' + ksEsc(c.id) + '" onclick="event.stopPropagation();confirmRemoveLinkedCard(this)" title="Відключити картку">' + ksIcon('trash') + '</button>';
    var sub = '•••• ' + ksEsc(c.last4) + (c.holder ? ' · ' + ksEsc(c.holder) : '') + (c.expiry ? ' · ' + ksEsc(c.expiry) : '');
    return '<div class="ks-row is-tappable" onclick="switchActiveCard(\'' + ksEsc(c.id) + '\')"' + (c.active ? ' style="background:var(--ks-acc-dim);"' : '') + '>' +
      '<div class="ks-icn" style="background:' + c.markColor + ';color:#fff;font-weight:800;font-size:11px;">' + ksEsc(c.mark) + '</div>' +
      '<div class="ks-row-main">' +
        '<div class="ks-row-title">' + ksEsc(c.bankName) + (expired ? ' · <span style="color:var(--ks-neg);">прострочена</span>' : '') + '</div>' +
        '<div class="ks-row-sub ks-num">' + sub + '</div>' +
      '</div>' +
      '<div class="ks-row-value ks-num" style="margin-right:6px;">' + formatNumber(c.balance) + ' ₴' + (badge ? '<small>' + badge + '</small>' : '') + '</div>' +
      act +
      '</div>';
  }).join('') + cardLimitRowHtml();
}

// Рядок ліміту живе в тій самій панелі, що й картки — окремої розмітки не треба.
function cardLimitRowHtml() {
  var card = getActiveCardObj();
  if(!card) return '';
  var lim = cardDayLimit(card.id);
  var sub = lim > 0
    ? ('Сьогодні: ' + formatNumber(cardSpentToday(card.id)) + ' / ' + formatNumber(lim) + ' ₴')
    : 'Не встановлено';
  return '<div class="ks-row is-tappable" onclick="openCardLimitModal()">' +
    '<div class="ks-icn">' + ksIcon('shield') + '</div>' +
    '<div class="ks-row-main">' +
      '<div class="ks-row-title">Денний ліміт · ····' + ksEsc(card.last4) + '</div>' +
      '<div class="ks-row-sub">' + ksEsc(sub) + '</div>' +
    '</div>' +
    '<div class="ks-row-value">' + (lim > 0 ? formatNumber(cardLimitLeft(card.id)) + ' ₴' : '—') + '</div>' +
  '</div>';
}

function renderCardMetaRow(card) {
  var el = document.getElementById('cardMetaRow');
  if(!el) return;
  if(!card) {
    el.innerHTML =
      '<section class="ks-panel">' +
        '<div class="ks-empty">' +
          '<div class="ks-empty-icn">' + ksIcon('card') + '</div>' +
          '<div class="ks-empty-title">Підключіть свою картку</div>' +
          '<div class="ks-empty-text">SlotOK не випускає власних карток. Підключіть <b>свою картку</b> ' +
            'або картку <b>Аксіома Банку</b> — саме вона й стане вашою карткою в Касі.</div>' +
          '<div class="ks-btn-row">' +
            '<button class="ks-btn is-primary" onclick="openAddCardModal()">' + ksIcon('plus') + ' Своя картка</button>' +
            '<button class="ks-btn" onclick="openAxiomLinkFlow()">' + ksIcon('bank') + ' Аксіома</button>' +
          '</div>' +
        '</div>' +
      '</section>';
    return;
  }
  if(card.kind === 'axiom' || card.kind === 'partner') {
    var renewBtn = '';
    if(card.kind === 'partner') {
      var dLeft = Math.max(0, Math.ceil(((card.expiresAt || 0) - Date.now()) / 86400000));
      if(card.expiresAt && (card.expiresAt < Date.now() || dLeft <= 7)) {
        renewBtn = '<button class="ks-btn is-primary is-block" style="margin-bottom:8px;" onclick="renewPartnerCard(\'' + ksEsc(card.id) + '\')">' + ksIcon('clock') + ' Продовжити на 30 днів</button>';
      }
    }
    el.innerHTML = renewBtn +
      '<div class="ks-btn-row" style="margin-bottom:8px;">' +
        '<button class="ks-btn is-quiet" id="cvvToggleBtn" onclick="toggleCvvVisibility()">' + ksIcon('eye') + ' CVV</button>' +
        '<button class="ks-btn is-quiet" onclick="copyCardNumberFlash()">' + ksIcon('copy') + ' Номер</button>' +
        '<button class="ks-btn is-quiet" style="flex:0 0 auto;padding:13px 15px;" onclick="openCardColorPicker()" ' +
          'title="Скін картки">' + ksIcon('palette') + '</button>' +
      '</div>' +
      '<p class="ks-hint" style="text-align:center;margin:0 0 14px;">Натисніть на картку, щоб перевернути</p>';
    return;
  }
  el.innerHTML =
    '<div class="ks-btn-row" style="margin-bottom:8px;">' +
      '<button class="ks-btn is-quiet" onclick="openAddCardModal()">' + ksIcon('plus') + ' Ще картка</button>' +
      '<button class="ks-btn is-quiet" style="flex:0 0 auto;padding:13px 15px;" onclick="openCardColorPicker()" title="Скін картки">' + ksIcon('palette') + '</button>' +
    '</div>' +
    '<p class="ks-hint" style="text-align:center;margin:0 0 14px;">' +
      'Повний номер і CVV лишаються у вашому банку — SlotOK зберігає лише останні 4 цифри.</p>';
}

function renderCardQuickActions(card) {
  var el = document.getElementById('cardQuickActions');
  if(!el) return;
  var frozen = isActiveCardFrozen();
  // Поповнення, вивід, кешбек, курси й казино працюють і без картки —
  // інакше новий гравець не зміг би завести перші кошти. Картку вимагають
  // тільки суто карткові дії.
  var acts = [
    { k:'topup',      icon:'down',    label:'Донат',      needsCard:false },
    { k:'transfer',   icon:'send',    label:'Переказ',   needsCard:true  },
    { k:'cashback',   icon:'percent', label:'Кешбек',    needsCard:false },
    { k:'buySlotyky', icon:'trend',   label:'Курси',     needsCard:false },
    { k:'skinShop',   icon:'palette', label:'Скін',      needsCard:true  },
    { k:'freeze',     icon:frozen ? 'unlock' : 'lock', label:frozen ? 'Розблок.' : 'Блок', needsCard:true },
    { k:'casino',     icon:'dice',    label:'Казино',    needsCard:false },
  ];
  el.innerHTML = acts.map(function(a) {
    var off = a.needsCard && !card;
    return '<button class="ks-quick-btn" onclick="bankAction(\'' + a.k + '\')"' +
      (off ? ' disabled title="Спочатку підключіть картку"' : '') + '>' +
      ksIcon(a.icon) + '<span>' + a.label + '</span></button>';
  }).join('');
}

// ── Додавання своєї картки ───────────────────────────────────────
var _ksAddBank = 'privat';

function openAddCardModal() {
  if(!currentUser || !db) return notify('Спочатку увійдіть', 'error');
  closeAddCardModal();
  var banks = Object.keys(KS_BANKS).map(function(id) {
    var b = KS_BANKS[id];
    return '<button class="ks-btn is-sm' + (id === _ksAddBank ? ' is-primary' : ' is-quiet') + '" ' +
      'data-bank="' + id + '" onclick="selectAddCardBank(\'' + id + '\')" style="justify-content:flex-start;">' +
      '<span class="ks-bank" style="width:20px;height:20px;border-radius:6px;display:flex;align-items:center;' +
      'justify-content:center;font-size:10px;font-weight:800;color:#fff;background:' + b.color + ';">' + b.short + '</span>' +
      b.name + '</button>';
  }).join('');
  var m = document.createElement('div');
  m.className = 'ks-modal';
  m.id = 'ksAddCardModal';
  m.addEventListener('click', function(e) { if(e.target === m) closeAddCardModal(); });
  m.innerHTML =
    '<div class="ks-modal-box">' +
      '<div class="ks-modal-head">' +
        '<div class="ks-modal-title">Підключити свою картку</div>' +
        '<button class="ks-modal-x" onclick="closeAddCardModal()">' + ksIcon('x') + '</button>' +
      '</div>' +
      '<label class="ks-label">Банк</label>' +
      '<div id="ksAddBankGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;">' + banks + '</div>' +
      '<div class="ks-field">' +
        '<label class="ks-label" for="ksAcHolder">Ім\'я власника</label>' +
        '<input id="ksAcHolder" maxlength="26" autocomplete="off" placeholder="IVAN KOVALENKO">' +
      '</div>' +
      '<div class="ks-field">' +
        '<label class="ks-label" for="ksAcNum">Номер картки</label>' +
        '<input id="ksAcNum" inputmode="numeric" autocomplete="off" maxlength="19" placeholder="0000 0000 0000 0000" ' +
          'oninput="ksFormatCardNum(this)" style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:1.5px;">' +
      '</div>' +
      '<div class="ks-field">' +
        '<label class="ks-label" for="ksAcExp">Дійсна до</label>' +
        '<input id="ksAcExp" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="MM/YY" ' +
          'oninput="ksFormatExpiry(this)" style="font-family:ui-monospace,Menlo,Consolas,monospace;">' +
      '</div>' +
      '<div class="ks-copy" style="align-items:flex-start;">' +
        '<span style="color:#31c48d;margin-top:1px;">' + ksIcon('shield', 17) + '</span>' +
        '<div class="ks-copy-main ks-hint">У базу SlotOK запишемо лише <b>банк, ім\'я, термін дії та останні 4 цифри</b>. ' +
          'Повний номер використовується лише тут, у браузері, для перевірки — і не зберігається. CVV не запитуємо ніколи.</div>' +
      '</div>' +
      '<button class="ks-btn is-primary is-block" onclick="submitAddCard()">Підключити картку</button>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:16px 0 12px;">' +
        '<div style="flex:1;height:1px;background:var(--ks-line);"></div>' +
        '<span class="ks-hint">або</span>' +
        '<div style="flex:1;height:1px;background:var(--ks-line);"></div>' +
      '</div>' +
      '<button class="ks-btn is-block" style="margin-bottom:8px;" onclick="createPartnerCard()">' + ksIcon('card') + ' Згенерувати Партнер-картку (30 днів)</button>' +
      '<button class="ks-btn is-block" onclick="closeAddCardModal();openAxiomLinkFlow()">' + ksIcon('bank') + ' Привʼязати картку Аксіома Банку</button>' +
      '<p class="ks-hint" style="margin:10px 0 0;text-align:center;">Партнер-картку створює SlotOK (діє 30 днів). Аксіому — привʼяжи 6-значним кодом із застосунку Аксіома.</p>' +
    '</div>';
  document.body.appendChild(m);
  setTimeout(function() { var f = document.getElementById('ksAcHolder'); if(f) f.focus(); }, 60);
}
function closeAddCardModal() {
  var m = document.getElementById('ksAddCardModal');
  if(m) m.remove();
}
function selectAddCardBank(id) {
  _ksAddBank = id;
  var grid = document.getElementById('ksAddBankGrid');
  if(!grid) return;
  Array.prototype.forEach.call(grid.querySelectorAll('[data-bank]'), function(b) {
    var on = b.getAttribute('data-bank') === id;
    b.className = 'ks-btn is-sm' + (on ? ' is-primary' : ' is-quiet');
  });
}
function ksFormatCardNum(inp) {
  var d = inp.value.replace(/\D/g,'').slice(0,16);
  inp.value = d.replace(/(.{4})(?=.)/g,'$1 ');
}
function ksFormatExpiry(inp) {
  var d = inp.value.replace(/\D/g,'').slice(0,4);
  inp.value = d.length > 2 ? d.slice(0,2) + '/' + d.slice(2) : d;
}

function submitAddCard() {
  if(!currentUser || !db) return notify('Спочатку увійдіть', 'error');
  var holder = (document.getElementById('ksAcHolder') || {value:''}).value.trim();
  var digits = (document.getElementById('ksAcNum') || {value:''}).value.replace(/\D/g,'');
  var exp    = (document.getElementById('ksAcExp') || {value:''}).value.trim();

  if(holder.length < 3)  return notify('Вкажіть ім\'я власника картки', 'error');
  if(digits.length !== 16) return notify('Номер картки — 16 цифр', 'error');
  if(!ksLuhn(digits))    return notify('Такого номера картки не існує — перевірте цифри', 'error');
  var m = /^(\d{2})\/(\d{2})$/.exec(exp);
  if(!m)                 return notify('Термін дії у форматі MM/YY', 'error');
  var mm = parseInt(m[1], 10), yy = 2000 + parseInt(m[2], 10);
  if(mm < 1 || mm > 12)  return notify('Некоректний місяць у терміні дії', 'error');
  // Картка дійсна до останнього дня вказаного місяця включно
  if(new Date(yy, mm, 1).getTime() <= Date.now()) return notify('Термін дії цієї картки вже сплив', 'error');

  var last4 = digits.slice(-4);
  var dup = getLinkedCards().some(function(c) {
    return c.kind === 'external' && c.bank === _ksAddBank && c.last4 === last4;
  });
  if(dup) return notify('Ця картка вже підключена', 'error');

  // Повний номер далі не йде: у базу пишемо лише маску.
  var rec = {
    bank: _ksAddBank,
    holder: holder.toUpperCase().slice(0, 26),
    last4: last4,
    expiry: exp,
    addedAt: Date.now(),
  };
  var ref = db.ref('users/' + currentUser + '/linkedCards').push();
  rec.balance = 0;
  ref.set(rec);
  userData.linkedCards = userData.linkedCards || {};
  userData.linkedCards[ref.key] = rec;
  _adoptOrZeroBalance(ref.key, ref);

  closeAddCardModal();
  notify('Картку підключено', 'success');
  if(navigator.vibrate) navigator.vibrate([40,30,60]);
  renderCardPanel();
}

// Двокроковий підтверджувач замість системного confirm(): перший тап
// «озброює» кнопку, другий відключає картку.
function confirmRemoveLinkedCard(btn) {
  var id = btn.getAttribute('data-id');
  if(btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.style.color = '#f0556b';
    btn.style.borderColor = 'rgba(240,85,107,.5)';
    btn.title = 'Натисніть ще раз, щоб відключити';
    notify('Натисніть ще раз, щоб відключити картку', 'info');
    setTimeout(function() {
      if(!btn.parentNode) return;
      btn.dataset.armed = '0';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 4000);
    return;
  }
  removeLinkedCard(id);
}

function removeLinkedCard(id) {
  if(!id || !db || !currentUser || id === 'axiom') return;
  var activeId = getActiveCardId();
  // Баланс картки, що відключається (для активної — це живий userData.balance)
  var remBal = (id === activeId) ? (userData.balance || 0) : _storedBalOf(id);
  var others = _rawCardIds().filter(function(x){ return x !== id; });

  db.ref('users/' + currentUser + '/linkedCards/' + id).remove();
  if(userData.linkedCards) delete userData.linkedCards[id];

  if(others.length) {
    // Гроші відключеної картки зливаються в активну (або в першу, що лишилась),
    // щоб нічого не загубилось. Ця картка стає активною, а balance = її баланс + залишок.
    var newActive = (id === activeId) ? others[0] : activeId;
    if(others.indexOf(newActive) < 0) newActive = others[0];
    var merged = _storedBalOf(newActive) + remBal;
    var updates = {};
    updates['balance'] = merged;
    updates['activeCardId'] = newActive;
    userData.balance = merged;
    userData.activeCardId = newActive;
    db.ref('users/' + currentUser).update(updates);
  } else {
    // Остання картка — залишок лишається на балансі гравця (безкартковий гаманець)
    if(id === activeId) { /* userData.balance вже містить залишок */ }
    else { db.ref('users/' + currentUser + '/balance').set((userData.balance || 0) + remBal); userData.balance = (userData.balance || 0) + remBal; }
    db.ref('users/' + currentUser + '/activeCardId').remove();
    if(id === 'axiom' && userData.virtualCard && userData.virtualCard.frozen) {
      db.ref('users/' + currentUser + '/virtualCard/frozen').set(false);
      userData.virtualCard.frozen = false;
    }
  }
  notify(remBal > 0 ? ('Картку відключено · ' + formatNumber(remBal) + ' ₴ перенесено') : 'Картку відключено', 'info');
  renderCardPanel();
  renderSourceBars();
}

// Луна-валідний номер (щоб виглядав як справжній і проходив ті ж перевірки)
function ksGenCardNumber(prefix) {
  var body = String(prefix || '');
  while(body.length < 15) body += Math.floor(Math.random() * 10);
  body = body.slice(0, 15);
  var sum = 0, dbl = true;
  for(var i = body.length - 1; i >= 0; i--) {
    var d = body.charCodeAt(i) - 48;
    if(dbl) { d *= 2; if(d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return body + ((10 - (sum % 10)) % 10);
}

// Генерація тимчасової Партнер-картки — єдина картка, яку SlotOK створює сам,
// і лише коли гравець сам натиснув кнопку (автоматично нікому не видається).
function createPartnerCard() {
  if(!currentUser || !db) return notify('Спочатку увійдіть', 'error');
  var digits = ksGenCardNumber('4400');
  var expDate = new Date(Date.now() + 30 * 86400000);
  var exp = ('0' + (expDate.getMonth() + 1)).slice(-2) + '/' + String(expDate.getFullYear()).slice(-2);
  var rec = {
    bank: 'partner', generated: true,
    holder: String(currentUser || 'USER').toUpperCase().slice(0, 26),
    number: digits.replace(/(.{4})(?=.)/g, '$1 '),
    last4: digits.slice(-4),
    cvv: String(Math.floor(100 + Math.random() * 900)),
    expiry: exp, addedAt: Date.now(),
    expiresAt: expDate.getTime(), balance: 0,
  };
  var ref = db.ref('users/' + currentUser + '/linkedCards').push();
  ref.set(rec);
  userData.linkedCards = userData.linkedCards || {};
  userData.linkedCards[ref.key] = rec;
  _adoptOrZeroBalance(ref.key, ref);
  closeAddCardModal();
  notify('Партнер-картку згенеровано · діє 30 днів', 'success');
  if(navigator.vibrate) navigator.vibrate([60, 40, 80]);
  renderCardPanel();
}

function renewPartnerCard(id) {
  if(!db || !currentUser || !userData.linkedCards || !userData.linkedCards[id]) return;
  var when = Date.now() + 30 * 86400000;
  db.ref('users/' + currentUser + '/linkedCards/' + id + '/expiresAt').set(when);
  userData.linkedCards[id].expiresAt = when;
  notify('Партнер-картку продовжено ще на 30 днів', 'success');
  renderCardPanel();
}

// Рядок «джерело коштів» — показує активну картку й дозволяє перемкнути.
// Живить поповнення (кошти йдуть на активну картку), вивід і переказ.
function sourceBarHtml(ctx) {
  var a = getActiveCardObj();
  if(!a) {
    return '<div class="ks-copy" style="margin-bottom:14px;"><div class="ks-copy-main ks-hint">' +
      'Картку не підключено — кошти йдуть на спільний баланс. ' +
      '<b style="color:var(--ks-acc);cursor:pointer;" onclick="switchCashierTab(\'card\',document.getElementById(\'ctb-card\'))">Підключити</b></div></div>';
  }
  var verb = ctx === 'withdraw' ? 'Вивід з картки' : ctx === 'transfer' ? 'Переказ з картки' : 'Зарахувати на картку';
  return '<div class="ks-copy" style="margin-bottom:14px;">' +
    '<div class="ks-icn" style="background:' + a.markColor + ';color:#fff;font-weight:800;font-size:11px;width:32px;height:32px;">' + ksEsc(a.mark) + '</div>' +
    '<div class="ks-copy-main">' +
      '<div class="ks-label" style="margin-bottom:2px;">' + verb + '</div>' +
      '<div class="ks-copy-val" style="font-family:var(--ks-sans);font-size:14px;">' + ksEsc(a.bankName) + ' ····' + ksEsc(a.last4) +
        ' · <span class="ks-num">' + formatNumber(a.balance) + ' ₴</span></div>' +
    '</div>' +
    (getLinkedCards().length > 1 ? '<button class="ks-btn is-quiet is-sm" style="width:auto;flex:0 0 auto;" onclick="openCardSourcePicker()">Змінити</button>' : '') +
    '</div>';
}
function renderSourceBars() {
  ['depSourceBar', 'wdSourceBar', 'transferSourceBar'].forEach(function(id) {
    var el = document.getElementById(id);
    if(el) el.innerHTML = sourceBarHtml(id === 'wdSourceBar' ? 'withdraw' : id === 'transferSourceBar' ? 'transfer' : 'deposit');
  });
}
function openCardSourcePicker() {
  var cards = getLinkedCards();
  if(cards.length < 2) return;
  var m = document.createElement('div');
  m.className = 'ks-modal'; m.id = 'ksSrcModal';
  m.addEventListener('click', function(e){ if(e.target === m) m.remove(); });
  m.innerHTML = '<div class="ks-modal-box">' +
    '<div class="ks-modal-head"><div class="ks-modal-title">Активна картка</div>' +
      '<button class="ks-modal-x" onclick="document.getElementById(\'ksSrcModal\').remove()">' + ksIcon('x') + '</button></div>' +
    '<p class="ks-hint" style="margin:0 0 14px;">Обрана картка живить ігри, поповнення і переказ.</p>' +
    cards.map(function(c) {
      return '<div class="ks-row is-tappable"' + (c.active ? ' style="background:var(--ks-acc-dim);"' : '') +
        ' onclick="switchActiveCard(\'' + ksEsc(c.id) + '\');document.getElementById(\'ksSrcModal\').remove()">' +
        '<div class="ks-icn" style="background:' + c.markColor + ';color:#fff;font-weight:800;font-size:11px;">' + ksEsc(c.mark) + '</div>' +
        '<div class="ks-row-main"><div class="ks-row-title">' + ksEsc(c.bankName) + '</div>' +
          '<div class="ks-row-sub ks-num">•••• ' + ksEsc(c.last4) + '</div></div>' +
        '<div class="ks-row-value ks-num">' + formatNumber(c.balance) + ' ₴' + (c.active ? '<small><span class="ks-badge is-pos">Активна</span></small>' : '') + '</div>' +
        '</div>';
    }).join('') +
    '</div>';
  document.body.appendChild(m);
}

// ═══════════════════════════════════════════════════════════════════
// ПЕРЕКИД МІЖ СВОЇМИ КАРТКАМИ
// Гроші не залишають гаманець, тож це не «переказ гравцю»: ні заявки, ні
// адміна — один атомарний update двох балансів. Баланс активної картки живе
// в users/<nick>/balance, решти — на самій картці, тому шлях кожного боку
// рахує cardBalancePath(). Перемикати активну картку заради перекиду не треба.
// ═══════════════════════════════════════════════════════════════════
var _ksMoveFrom = null, _ksMoveTo = null;

function openCardMoveModal() {
  var cards = getLinkedCards();
  if(cards.length < 2) return notify('Потрібно щонайменше дві підключені картки', 'error');
  _ksMoveFrom = getActiveCardId() || cards[0].id;
  _ksMoveTo   = (cards.filter(function(c){ return c.id !== _ksMoveFrom; })[0] || {}).id || null;
  var old = document.getElementById('ksMoveModal'); if(old) old.remove();
  var m = document.createElement('div');
  m.className = 'ks-modal'; m.id = 'ksMoveModal';
  m.addEventListener('click', function(e){ if(e.target === m) m.remove(); });
  m.innerHTML = '<div class="ks-modal-box">' +
    '<div class="ks-modal-head"><div class="ks-modal-title">Перекид між картками</div>' +
      '<button class="ks-modal-x" onclick="document.getElementById(\'ksMoveModal\').remove()">' + ksIcon('x') + '</button></div>' +
    '<p class="ks-hint" style="margin:0 0 14px;">Гроші лишаються у вашому гаманці — зарахування миттєве, без заявки та комісії.</p>' +
    '<div id="ksMoveBody"></div>' +
    '</div>';
  document.body.appendChild(m);
  renderCardMoveBody();
}

// Тап по картці, що вже стоїть з протилежного боку, просто розвертає напрям —
// так стан «звідки == куди» недосяжний і кнопку не треба блокувати.
function ksMovePick(side, id) {
  if(side === 'from') { if(id === _ksMoveTo) _ksMoveTo = _ksMoveFrom; _ksMoveFrom = id; }
  else                { if(id === _ksMoveFrom) _ksMoveFrom = _ksMoveTo; _ksMoveTo = id; }
  renderCardMoveBody();
}
function ksMoveSwap() { var f = _ksMoveFrom; _ksMoveFrom = _ksMoveTo; _ksMoveTo = f; renderCardMoveBody(); }
function ksMoveSetAmt(v) { var i = document.getElementById('ksMoveAmt'); if(i) { i.value = v; i.focus(); } }

function renderCardMoveBody() {
  var el = document.getElementById('ksMoveBody');
  if(!el) return;
  var cards = getLinkedCards();
  var byId = {}; cards.forEach(function(c){ byId[c.id] = c; });
  var src = byId[_ksMoveFrom], dst = byId[_ksMoveTo];
  var avail = src ? (src.balance || 0) : 0;
  function chips(side, sel) {
    return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">' + cards.map(function(c) {
      return '<button class="ks-btn is-sm' + (c.id === sel ? ' is-primary' : ' is-quiet') + '" ' +
        'style="flex:1 1 46%;justify-content:flex-start;" ' +
        'onclick="ksMovePick(\'' + side + '\',\'' + ksEsc(c.id) + '\')">' +
        '<span style="width:18px;height:18px;border-radius:5px;display:flex;align-items:center;justify-content:center;' +
        'font-size:9px;font-weight:800;color:#fff;background:' + c.markColor + ';">' + ksEsc(c.mark) + '</span>' +
        '····' + ksEsc(c.last4) + '</button>';
    }).join('') + '</div>';
  }
  el.innerHTML =
    '<div class="ks-label">Звідки</div>' + chips('from', _ksMoveFrom) +
    '<button class="ks-btn is-quiet is-sm is-block" style="margin-bottom:12px;" onclick="ksMoveSwap()">' +
      ksIcon('swap') + ' Поміняти місцями</button>' +
    '<div class="ks-label">Куди</div>' + chips('to', _ksMoveTo) +
    '<div class="ks-label" style="display:flex;justify-content:space-between;text-transform:none;letter-spacing:0;font-size:12px;">' +
      '<span>Сума</span><span class="ks-num">на картці ' + formatNumber(avail) + ' ₴</span></div>' +
    '<input id="ksMoveAmt" type="number" inputmode="numeric" min="1" placeholder="0" style="margin-bottom:8px;">' +
    '<div class="ks-btn-row" style="margin-bottom:14px;">' +
      [25, 50, 100].map(function(p) {
        return '<button class="ks-btn is-quiet is-sm" onclick="ksMoveSetAmt(' + Math.floor(avail * p / 100) + ')">' +
          (p === 100 ? 'Усе' : p + '%') + '</button>';
      }).join('') + '</div>' +
    '<button class="ks-btn is-primary is-block" onclick="submitCardMove()"' + (avail < 1 || !dst ? ' disabled' : '') + '>' +
      ksIcon('swap') + ' Переказати' + (dst ? ' на ····' + ksEsc(dst.last4) : '') + '</button>';
}

function submitCardMove() {
  var amount = Math.floor(parseFloat((document.getElementById('ksMoveAmt') || {}).value));
  if(!amount || amount < 1) return notify('Введіть суму', 'error');
  if(moveBetweenCards(_ksMoveFrom, _ksMoveTo, amount)) {
    var m = document.getElementById('ksMoveModal'); if(m) m.remove();
  }
}

function moveBetweenCards(fromId, toId, amount) {
  if(!db || !currentUser || !userData) return false;
  if(!fromId || !toId || fromId === toId) { notify('Оберіть дві різні картки', 'error'); return false; }
  var ids = _rawCardIds();
  if(ids.indexOf(fromId) < 0 || ids.indexOf(toId) < 0) { notify('Картку не знайдено', 'error'); return false; }
  var byId = {}; getLinkedCards().forEach(function(c){ byId[c.id] = c; });
  var src = byId[fromId], dst = byId[toId];
  if(!src || !dst) return false;
  // Заморожена картка не віддає гроші; приймати на себе — може.
  if(src.frozen) { notify('Картку ····' + src.last4 + ' заблоковано', 'error'); return false; }
  if(!checkCardLimit(fromId, amount)) return false;
  if((src.balance || 0) < amount) { notify('На картці ····' + src.last4 + ' лише ' + formatNumber(src.balance) + ' ₴', 'error'); return false; }
  var pFrom = cardBalancePath(userData, fromId), pTo = cardBalancePath(userData, toId);
  // Страховка на грошовому шляху: якщо обидві картки раптом вказали в один
  // вузол, update() залишив би там лише другий приріст і сума подвоїлась би.
  if(pFrom === pTo) { notify('Не вдалося визначити картки', 'error'); return false; }
  var updates = {};
  updates[pFrom] = firebase.database.ServerValue.increment(-amount);
  updates[pTo]   = firebase.database.ServerValue.increment(amount);
  db.ref('users/' + currentUser).update(updates);
  // локально теж — щоб панель не блимала старими числами до відповіді Firebase
  _applyLocalCardDelta(fromId, -amount);
  _applyLocalCardDelta(toId, amount);
  noteCardSpend(fromId, amount);
  pushCardTx(currentUser, { dir:'out', amount:amount, title:'Перекид на ····' + dst.last4, subtitle:dst.bankName, icon:'🔁' }, fromId);
  pushCardTx(currentUser, { dir:'in',  amount:amount, title:'Перекид з ····' + src.last4,  subtitle:src.bankName, icon:'🔁' }, toId);
  notify('Перекинуто ' + formatNumber(amount) + ' ₴ на ····' + dst.last4, 'success');
  if(navigator.vibrate) navigator.vibrate(20);
  renderCardPanel();
  renderSourceBars();
  return true;
}

// Локальне дзеркало того самого правила: активна картка живе в userData.balance,
// решта — у власному полі. Без цього панель показувала б старі числа до відповіді Firebase.
function _applyLocalCardDelta(id, delta) {
  if(id === getActiveCardId()) { userData.balance = (userData.balance || 0) + delta; return; }
  if(id === 'axiom') { if(userData.virtualCard) userData.virtualCard.balance = (userData.virtualCard.balance || 0) + delta; return; }
  if(userData.linkedCards && userData.linkedCards[id]) userData.linkedCards[id].balance = (userData.linkedCards[id].balance || 0) + delta;
}


// ═══════════════════════════════════════════════════════════════════
// ПРАВИЛА ТА ЗГОДА ГРАВЦЯ
// Гейт показується один раз на версію правил і блокує решту застосунку,
// доки гравець не підтвердить вік і не погодиться не лізти в код сайту.
// Це ПІДТВЕРДЖЕННЯ, а не захист: правила Firebase дозволяють клієнту писати
// у свої вузли, тож технічно обійти гейт може будь-хто, хто цього захоче.
// Сенс у тому, щоб людина свідомо прочитала й натиснула, а не в тому, щоб
// зупинити зловмисника — для цього потрібен серверний бік (див. ROADMAP.md).
// Піднімаємо TERMS_VERSION, коли текст правил змінюється по суті: тоді
// згоду запитають наново.
// ═══════════════════════════════════════════════════════════════════
var TERMS_VERSION = '1';

var TERMS_SECTIONS = [
  {
    title: 'Вік',
    items: [
      'Користуватись SlotOK можна з 14 років. Підтверджуючи згоду, ти заявляєш, що тобі вже виповнилось 14.',
      'Якщо тобі менше — закрий сайт. Акаунти, власники яких не досягли цього віку, блокуються без повернення балансу.',
    ]
  },
  {
    title: 'Один акаунт',
    items: [
      'На одного гравця — один акаунт. Другий акаунт, створений тією самою людиною, вважається мультиакаунтингом.',
      'За мультиакаунтинг блокуються всі пов’язані профілі, а не лише останній.',
    ]
  },
  {
    title: 'Не лізь у код сайту',
    items: [
      'Заборонено змінювати сторінку через консоль браузера, розширення, перехоплення запитів чи будь-яку автоматизацію ставок.',
      'Заборонено писати напряму в базу даних в обхід інтерфейсу.',
      'Якщо знайшов помилку, яка дає гроші чи перевагу — напиши в підтримку. Використання такої помилки прирівнюється до спроби зламу, і баланс, здобутий нею, анулюється.',
      'Того, хто повідомив про діру замість того, щоб нею скористатись, ми дякуємо і не караємо.',
    ]
  },
  {
    title: 'Чесна гра',
    items: [
      'Заборонена змова між гравцями в іграх один проти одного та в турнірах.',
      'Заборонено передавати акаунт іншій людині або грати з чужого.',
      'Результати ігор визначає код сайту; спори вирішує адміністратор.',
    ]
  },
  {
    title: 'Каса',
    items: [
      'Донат — добровільна підтримка проєкту, не купівля товару. Замість нього на баланс нараховується бонус.',
      'Донати обробляє адміністратор вручну — миттєвого зарахування немає.',
      'Заявка на донат прив’язується до картки, активної на момент подачі: бонус зарахується саме на неї.',
      'Баланс ігровий і використовується тільки на самій платформі — виводу коштів на картку чи USDT немає.',
    ]
  },
  {
    title: 'Відповідальна гра',
    items: [
      'У Налаштуваннях є особисті ліміти на програш і тривалість сесії та само-виключення на час.',
      'У Касі можна поставити денний ліміт на картку — скільки максимум за добу може піти з неї назовні.',
      'Якщо відчуваєш, що граєш забагато — увімкни само-виключення. Адміністратор не знімає його достроково на прохання.',
    ]
  },
  {
    title: 'Твої дані',
    items: [
      'Зберігаються: нік, хеш пароля, баланс і його історія, операції по картках, налаштування, прив’язаний Telegram (якщо прив’язав) і токен пристрою для сповіщень (якщо дозволив).',
      'Іншим гравцям видно твій нік, аватар, рівень, досягнення й публічну статистику. Баланс картки, операції та Telegram — не видно.',
      'Видалення акаунта — через підтримку.',
    ]
  },
  {
    title: 'Блокування',
    items: [
      'Адміністратор може заблокувати акаунт за порушення цих правил.',
      'Підозріла активність може тимчасово призупинити ставки й виводи до перевірки — це не блокування, напиши в підтримку.',
    ]
  },
  {
    title: 'Зміни правил',
    items: [
      'Правила можуть змінюватись. Коли зміниться суть — попросимо підтвердити згоду наново при вході.',
    ]
  },
];

function termsSectionsHtml() {
  return TERMS_SECTIONS.map(function(sec) {
    return '<div class="ks-label" style="margin-top:16px;">' + ksEsc(sec.title) + '</div>' +
      sec.items.map(function(it) {
        return '<p class="ks-hint" style="margin:0 0 7px;">• ' + ksEsc(it) + '</p>';
      }).join('');
  }).join('');
}

// Правила можна відкрити будь-коли — з вкладки «Ще» або з самого гейта.
function openRulesModal() {
  var old = document.getElementById('ksRulesModal'); if(old) old.remove();
  var m = document.createElement('div');
  m.className = 'ks-modal'; m.id = 'ksRulesModal';
  m.addEventListener('click', function(e){ if(e.target === m) m.remove(); });
  m.innerHTML = '<div class="ks-modal-box">' +
    '<div class="ks-modal-head"><div class="ks-modal-title">Правила SlotOK</div>' +
      '<button class="ks-modal-x" onclick="document.getElementById(\'ksRulesModal\').remove()">' + ksIcon('x') + '</button></div>' +
    '<p class="ks-hint" style="margin:0;">Правила користування сайтом. Версія ' + ksEsc(TERMS_VERSION) + '.</p>' +
    termsSectionsHtml() +
    '<button class="ks-btn is-quiet is-block" style="margin-top:18px;" onclick="document.getElementById(\'ksRulesModal\').remove()">Закрити</button>' +
    '</div>';
  document.body.appendChild(m);
}

// ── Гейт згоди ───────────────────────────────────────────────────
var TERMS_CHECKS = [
  { k: 'age',    text: 'Мені виповнилось 14 років' },
  { k: 'noHack', text: 'Я не лізтиму в консоль, не змінюватиму код сайту й не намагатимусь його зламати' },
  { k: 'read',   text: 'Я прочитав правила й погоджуюсь із ними' },
];
var _termsChecked = {};

function hasAcceptedTerms() {
  return !!(userData && userData.termsAcceptedAt && String(userData.termsVersion) === TERMS_VERSION);
}

function checkTermsGate() {
  if(!currentUser || !userData) return;
  if(hasAcceptedTerms()) return;
  if(document.getElementById('ksTermsGate')) return;
  _termsChecked = {};
  var m = document.createElement('div');
  m.className = 'ks-modal'; m.id = 'ksTermsGate';
  // Навмисно без закриття по фону і без хрестика: єдині виходи — підтвердити
  // або вийти з акаунта.
  m.innerHTML = '<div class="ks-modal-box">' +
    '<div class="ks-modal-head"><div class="ks-modal-title">Перш ніж грати</div></div>' +
    '<p class="ks-hint" style="margin:0 0 14px;">Коротко про головне. Повний текст — за кнопкою нижче.</p>' +
    '<div id="ksTermsChecks"></div>' +
    '<button class="ks-btn is-quiet is-block" style="margin:12px 0;" onclick="openRulesModal()">' + ksIcon('eye') + ' Читати повні правила</button>' +
    '<button class="ks-btn is-primary is-block" id="ksTermsAccept" disabled onclick="acceptTerms()">Підтверджую</button>' +
    '<button class="ks-btn is-quiet is-block" style="margin-top:8px;" onclick="logout()">Вийти</button>' +
    '</div>';
  document.body.appendChild(m);
  renderTermsChecks();
}

function renderTermsChecks() {
  var el = document.getElementById('ksTermsChecks');
  if(!el) return;
  el.innerHTML = TERMS_CHECKS.map(function(c) {
    var on = !!_termsChecked[c.k];
    return '<div class="ks-row is-tappable" onclick="toggleTermsCheck(\'' + c.k + '\')" style="align-items:flex-start;">' +
      '<div class="ks-icn' + (on ? ' is-pos' : '') + '">' + (on ? ksIcon('check') : '') + '</div>' +
      '<div class="ks-row-main"><div class="ks-row-sub" style="color:' + (on ? 'var(--ks-fg)' : 'var(--ks-fg-2)') + ';">' +
        ksEsc(c.text) + '</div></div>' +
    '</div>';
  }).join('');
  var btn = document.getElementById('ksTermsAccept');
  if(btn) btn.disabled = TERMS_CHECKS.some(function(c){ return !_termsChecked[c.k]; });
}

function toggleTermsCheck(k) {
  _termsChecked[k] = !_termsChecked[k];
  renderTermsChecks();
}

function acceptTerms() {
  if(TERMS_CHECKS.some(function(c){ return !_termsChecked[c.k]; })) return;
  if(!db || !currentUser) return;
  var now = Date.now();
  db.ref('users/' + currentUser).update({ termsAcceptedAt: now, termsVersion: TERMS_VERSION });
  userData.termsAcceptedAt = now;
  userData.termsVersion = TERMS_VERSION;
  var m = document.getElementById('ksTermsGate'); if(m) m.remove();
  notify('Дякуємо. Гарної гри!', 'success');
}

function openAxiomLinkFlow() { openTabModal('axiomLinkModal'); renderAxiomLinkContent(); }

// ═══════════════════════════════════════════════════════════════════
// ПАНЕЛЬ КАРТКИ
// ═══════════════════════════════════════════════════════════════════
function renderCardPanel() {
  if(!userData) return;
  var cards   = getLinkedCards();
  var primary = getActiveCardObj() || cards[0] || null;
  var isAxiom = !!(primary && primary.kind === 'axiom');
  var isFull  = !!(primary && (primary.kind === 'axiom' || primary.kind === 'partner')); // повний номер видно

  var bankNameEl = document.getElementById('vcardBankName');
  var badgeEl    = document.getElementById('vcardBadgeArea');
  var numEl      = document.getElementById('vcardNumber');
  var holderEl   = document.getElementById('vcardHolder');
  var expiryEl   = document.getElementById('vcardExpiry');
  var sigEl      = document.getElementById('vcardSignatureText');
  var cardElRoot = document.getElementById('vcardEl');
  var cvvFront   = document.getElementById('vcardCvvDisplay');
  var cvvBack    = document.getElementById('vcardCvvBack');

  // Кожна картка має власний скін; коли картки ще нема — тимчасовий pending-скін
  var skin  = (primary && primary.skin) || (!primary && userData.pendingCardSkin) || 'onyx';
  var photo = (primary && primary.customPhotoUrl) || (!primary ? userData.pendingCardPhotoUrl : '');

  var partnerExpired = !!(primary && primary.kind === 'partner' && primary.expiresAt && primary.expiresAt < Date.now());
  if(primary) {
    if(bankNameEl) bankNameEl.textContent = primary.bankName;
    if(badgeEl) {
      if(primary.kind === 'axiom') badgeEl.innerHTML = '<span class="ks-badge is-acc">Партнер</span>';
      else if(primary.kind === 'partner') {
        var dLeft = Math.max(0, Math.ceil(((primary.expiresAt || 0) - Date.now()) / 86400000));
        badgeEl.innerHTML = partnerExpired
          ? '<span class="ks-badge is-neg">Прострочена</span>'
          : '<span class="ks-badge is-acc">Партнер · ' + dLeft + 'д</span>';
      } else badgeEl.innerHTML = '<span class="ks-badge">Підключена</span>';
    }
    if(numEl)    numEl.textContent    = isFull ? primary.number : ('•••• •••• •••• ' + primary.last4);
    if(holderEl) holderEl.textContent = primary.holder || String(currentUser || '').toUpperCase();
    if(expiryEl) expiryEl.textContent = primary.expiry || '••/••';
    if(sigEl)    sigEl.textContent    = primary.holder || String(currentUser || '').toUpperCase();
    // CVV скидаємо в приховане; гравець відкриває сам через кнопку
    if(cvvFront) cvvFront.textContent = '•••';
    if(cvvBack)  cvvBack.textContent  = '•••';
  } else {
    if(bankNameEl) bankNameEl.textContent = 'SlotOK';
    if(badgeEl)    badgeEl.innerHTML = '';
    if(numEl)      numEl.textContent = '•••• •••• •••• ••••';
    if(holderEl)   holderEl.textContent = '—';
    if(expiryEl)   expiryEl.textContent = '••/••';
    if(sigEl)      sigEl.textContent = '—';
    if(cvvFront)   cvvFront.textContent = '•••';
    if(cvvBack)    cvvBack.textContent  = '•••';
  }
  if(cardElRoot) {
    cardElRoot.className = 'vcard vcard-skin-' + skin + (primary ? '' : ' vcard-unlinked');
    applyCardPhotoBg(cardElRoot, skin, photo);
  }

  // Накладка «картку не підключено» — щоб порожній пластик не читався
  // як справжня, просто ще не завантажена картка
  var lockEl = document.getElementById('vcardLockOverlay');
  if(!primary && cardElRoot) {
    if(!lockEl) {
      lockEl = document.createElement('div');
      lockEl.id = 'vcardLockOverlay';
      lockEl.className = 'ks-card-locked';
      lockEl.innerHTML = ksIcon('lock') + '<span>Картку не підключено</span>';
      cardElRoot.appendChild(lockEl);
    }
  } else if(lockEl) {
    lockEl.remove();
  }

  renderCardMetaRow(primary);
  renderCardQuickActions(primary);
  renderLinkedCards();
  renderSourceBars();

  var bal = userData.balance || 0;
  var balEl = document.getElementById('vcardBalance');
  if(balEl) {
    var old = parseFloat(balEl.dataset.prev);
    if(isNaN(old)) old = bal;
    balEl.dataset.prev = bal;
    animateNumberText(balEl, bal, '', '');
    if(old !== bal) {
      var change = bal - old;
      var changeEl = document.getElementById('balanceChange');
      if(changeEl) {
        changeEl.textContent = (change > 0 ? '+' : '') + formatNumber(change);
        changeEl.className = 'ks-delta ' + (change > 0 ? 'up' : 'down');
        setTimeout(function() { changeEl.classList.add('hidden'); }, 2500);
      }
    }
  }

  if(db && currentUser) {
    // Картка показує свою стрічку і свої підсумки; беремо із запасом, бо після
    // фільтра по картці з останніх 50 записів могло б лишитись два.
    var txCardId = getActiveCardId();
    db.ref('users/' + currentUser + '/cardTx').limitToLast(300).once('value').then(function(snap) {
      var totalIn = 0, totalOut = 0;
      var txList = Object.values(snap.val() || {})
        .filter(function(t) { return ksTxOnCard(t, txCardId); })
        .sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
      txList.forEach(function(t) {
        if(t.dir === 'in') totalIn += (t.amount||0);
        else               totalOut += (t.amount||0);
      });
      var inEl  = document.getElementById('vcardTotalIn');
      var outEl = document.getElementById('vcardTotalOut');
      if(inEl)  inEl.textContent  = formatNumber(totalIn) + ' ₴';
      if(outEl) outEl.textContent = formatNumber(totalOut) + ' ₴';
      renderTransactionList(txList.slice(0, 6));
    });
  }

  // Заморожена саме активна картка — її ж перевіряють ставки, переказ, вивід і перекид
  var frozen = isActiveCardFrozen();
  var frozenOverlay = document.getElementById('vcardFrozenOverlay');
  if(frozen && primary && cardElRoot) {
    if(!frozenOverlay) {
      frozenOverlay = document.createElement('div');
      frozenOverlay.id = 'vcardFrozenOverlay';
      frozenOverlay.className = 'vcard-frozen-overlay';
      frozenOverlay.innerHTML = '<div class="vcard-frozen-icon">' + ksIcon('lock') + '</div>' +
        '<div class="vcard-frozen-text">Заблоковано</div>';
      cardElRoot.appendChild(frozenOverlay);
    }
  } else if(frozenOverlay) {
    frozenOverlay.remove();
  }
}

// ── Історія операцій ─────────────────────────────────────────────
var KS_TX_KINDS = {
  in:       { cls:'is-pos',  icon:'inflow',  sign:'+' },
  out:      { cls:'is-neg',  icon:'outflow', sign:'−' },
  transfer: { cls:'',        icon:'swap',    sign:'−' },
  casino:   { cls:'',        icon:'dice',    sign:'−' },
  bonus:    { cls:'is-pos',  icon:'gift',    sign:'+' },
  slotiky:  { cls:'is-neg',  icon:'trend',   sign:'−' },
  cashback: { cls:'is-pos',  icon:'percent', sign:'+' },
  freeze:   { cls:'',        icon:'lock',    sign:'−' },
};
// Операції, записані до появи мульти-карткового гаманця, не мають cardId —
// показуємо їх у будь-якій картці, інакше історія старих гравців просто зникне.
function ksTxOnCard(t, cardId) { return !t || !t.cardId || !cardId || t.cardId === cardId; }
function ksTxRowHtml(t, cardLabel) {
  var dir  = t.dir || ((t.amount || 0) > 0 ? 'in' : 'out');
  var kind = KS_TX_KINDS[dir] || KS_TX_KINDS.in;
  var date = new Date(t.ts || Date.now())
    .toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  var sub  = [t.subtitle, cardLabel, date].filter(Boolean).join(' · ');
  return '<div class="ks-row">' +
    '<div class="ks-icn ' + kind.cls + '">' + ksIcon(kind.icon) + '</div>' +
    '<div class="ks-row-main">' +
      '<div class="ks-row-title">' + ksEsc(t.title || (dir === 'in' ? 'Надходження' : 'Списання')) + '</div>' +
      '<div class="ks-row-sub">' + ksEsc(sub) + '</div>' +
    '</div>' +
    '<div class="ks-row-value ' + kind.cls + '">' + kind.sign + formatNumber(Math.abs(t.amount || 0)) + ' ₴</div>' +
  '</div>';
}
function renderTransactionList(txs) {
  var el = document.getElementById('cardTransactionsList');
  if(!el) return;
  // Через map напряму передавати ksTxRowHtml не можна — другим аргументом
  // прилетів би індекс і сів у рядок як «підпис картки».
  el.innerHTML = (txs && txs.length)
    ? txs.map(function(t) { return ksTxRowHtml(t); }).join('')
    : '<div class="ks-muted">Операцій ще немає</div>';
}

function showAllTransactions() {
  if(!db || !currentUser) return;
  // Тут, на відміну від стрічки під карткою, показуємо весь гаманець —
  // тому кожен рядок підписуємо карткою, якій він належить.
  var label = {};
  getLinkedCards().forEach(function(c) { label[c.id] = c.bankName + ' ····' + c.last4; });
  db.ref('users/' + currentUser + '/cardTx').limitToLast(300).once('value').then(function(snap) {
    var txs = Object.values(snap.val() || {}).sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
    var m = document.createElement('div');
    m.className = 'ks-modal';
    m.id = 'ksAllTxModal';
    m.addEventListener('click', function(e) { if(e.target === m) m.remove(); });
    m.innerHTML =
      '<div class="ks-modal-box" style="padding:22px 0 10px;">' +
        '<div class="ks-modal-head" style="padding:0 20px;">' +
          '<div class="ks-modal-title">Усі операції</div>' +
          '<button class="ks-modal-x" onclick="document.getElementById(\'ksAllTxModal\').remove()">' + ksIcon('x') + '</button>' +
        '</div>' +
        (txs.length ? txs.map(function(t){ return ksTxRowHtml(t, label[t.cardId] || ''); }).join('') : '<div class="ks-muted">Операцій ще немає</div>') +
      '</div>';
    document.body.appendChild(m);
  });
}

function bankAction(action) {
  var needsCard = { transfer:1, skinShop:1, freeze:1 };
  if(needsCard[action] && !hasConnectedCard()) {
    notify('Спочатку підключіть картку в Касі', 'error');
    return;
  }
  var actions = {
    topup:      function() { switchCashierTab('deposit',  document.getElementById('ctb-deposit')); },
    transfer:   function() { openTabModal('transfer-modal'); },
    buySlotyky: function() { switchCashierTab('markets',  document.getElementById('ctb-markets')); },
    skinShop:   function() { openCardColorPicker(); },
    freeze:     function() { toggleCardFreeze(); },
    cashback:   function() { switchCashierTab('cashback', document.getElementById('ctb-cashback')); },
    casino:     function() { switchTab('lobby'); },
    slotikiBuy: function() { switchTab('lobby'); },
  };
  if(actions[action]) actions[action]();
  if(navigator.vibrate) navigator.vibrate(20);
}

// Блокуємо/розблоковуємо АКТИВНУ картку — саме ту, що показана на пластику
// й з якої йдуть гроші. Решта карток гаманця своїх станів не змінює.
function toggleCardFreeze() {
  var card = getActiveCardObj();
  if(!card) return notify('Спочатку підключіть картку в Касі', 'error');
  var frozen = isCardFrozen(card.id);
  db.ref('users/' + currentUser + '/' + _freezePath(card.id)).set(!frozen);
  if(card.id === 'axiom') { if(userData.virtualCard) userData.virtualCard.frozen = !frozen; }
  else if(userData.linkedCards && userData.linkedCards[card.id]) userData.linkedCards[card.id].frozen = !frozen;
  notify(frozen
    ? ('Картку ····' + card.last4 + ' розблоковано')
    : ('Картку ····' + card.last4 + ' заблоковано — списання з неї не пройде'), frozen ? 'success' : 'info');
  renderCardPanel();
}

// ── CARD COLOR PICKER (existing enhanced) ─────────────────────
// Каталог скінів карток — спільний для вибору скіна і для показу картки Аксіоми.
var CARD_SKINS = [
  // Класика
  {id:'gold',     name:'Золото',     accent:'#d4af37', prev:'linear-gradient(135deg,#1a0d00,#3a2200)'},
  {id:'onyx',     name:'Онікс',      accent:'#ddd',    prev:'linear-gradient(135deg,#000,#1a1a1a)'},
  {id:'platinum', name:'Платина',    accent:'#dcdce6', prev:'linear-gradient(135deg,#1a1a1d,#2c2c30)'},
  {id:'copper',   name:'Мідь',       accent:'#dc823c', prev:'linear-gradient(135deg,#1f0d00,#4a2200)'},
  {id:'minimal',  name:'Мінімал',    accent:'#333',    prev:'linear-gradient(160deg,#e8e8e8,#f5f5f5)'},
  // Самоцвіти
  {id:'sapphire', name:'Сапфір',     accent:'#4a9eff', prev:'linear-gradient(135deg,#000d1a,#002a55)'},
  {id:'emerald',  name:'Смарагд',    accent:'#3dd68c', prev:'linear-gradient(135deg,#001a0f,#003d24)'},
  {id:'amethyst', name:'Аметист',    accent:'#b450ff', prev:'linear-gradient(135deg,#1a0025,#33004d)'},
  {id:'rosegold', name:'Рожеве золото', accent:'#e6aaa0', prev:'linear-gradient(135deg,#2a1015,#4a2a28)'},
  {id:'coral',    name:'Корал',      accent:'#ff7f6e', prev:'linear-gradient(135deg,#1a0510,#330a1f)'},
  // Стихії
  {id:'fire',     name:'Вогонь',     accent:'#ff6400', prev:'linear-gradient(160deg,#1a0000,#4a1000)'},
  {id:'ice',      name:'Лід',        accent:'#96dcff', prev:'linear-gradient(150deg,#001a2a,#003350)'},
  {id:'mint',     name:'М\'ята',     accent:'#64ffd2', prev:'linear-gradient(135deg,#001a15,#003328)'},
  {id:'storm',    name:'Гроза',      accent:'#9696c8', prev:'linear-gradient(160deg,#05050a,#14141f)'},
  {id:'sunset',   name:'Захід',      accent:'#ff698c', prev:'linear-gradient(135deg,#4a1428,#3a1a08)'},
  // Космос і футуризм
  {id:'cyber',    name:'Кібер',      accent:'#00ffdc', prev:'linear-gradient(135deg,#000814,#001d3d)'},
  {id:'galaxy',   name:'Галактика',  accent:'#b48cff', prev:'linear-gradient(160deg,#0a0020,#1a0040)'},
  {id:'holo',     name:'Голограма',  accent:'#fff',    prev:'linear-gradient(120deg,#ff2ecc,#ffd12e,#2effc7,#2e6bff)'},
  // Текстури
  {id:'carbon',   name:'Карбон',     accent:'#aaa',    prev:'repeating-linear-gradient(45deg,#0a0a0a,#0a0a0a 4px,#1a1a1a 4px,#1a1a1a 8px)'},
  {id:'marble',   name:'Мармур',     accent:'#eee',    prev:'linear-gradient(160deg,#26262e,#1a1a22)'},
  {id:'denim',    name:'Джинс',      accent:'#6496dc', prev:'linear-gradient(160deg,#0a1a2e,#14304f)'},
  {id:'snake',    name:'Змія',       accent:'#78c878', prev:'linear-gradient(150deg,#0d1a0d,#1a2e1a)'},
  {id:'leopard',  name:'Леопард',    accent:'#c89650', prev:'linear-gradient(150deg,#3a2410,#4a3018)'},
  // Особливі
  {id:'pastel',   name:'Пастель',    accent:'#ffc8e6', prev:'linear-gradient(135deg,#2a1f2e,#3a2a40)'},
  {id:'xmas',     name:'Новий рік',  accent:'#ffd700', prev:'linear-gradient(135deg,#0a1a0a,#1a0505)'},
  {id:'ukraine',  name:'Україна',    accent:'#ffd700', prev:'linear-gradient(180deg,#0057b7 50%,#ffd700 50%)'},
  // Класика (нові)
  {id:'silver',   name:'Срібло',     accent:'#c8c8d2', prev:'linear-gradient(135deg,#1a1a1c,#3a3a3e)'},
  {id:'bronze',   name:'Бронза',     accent:'#cd7f32', prev:'linear-gradient(135deg,#1f1206,#4a2e12)'},
  {id:'obsidian', name:'Обсидіан',   accent:'#a050e0', prev:'linear-gradient(150deg,#050208,#180a2a)'},
  {id:'steel',    name:'Сталь',      accent:'#8caac8', prev:'linear-gradient(135deg,#0d1218,#2a3642)'},
  {id:'ivory',    name:'Слонова кістка', accent:'#3a3020', prev:'linear-gradient(160deg,#efe9dd,#f8f4ea)'},
  {id:'charcoal', name:'Вугілля',    accent:'#ddd',    prev:'linear-gradient(135deg,#0a0a0a,#232323)'},
  {id:'chrome',   name:'Хром',       accent:'#dcdce6', prev:'linear-gradient(120deg,#2c2c30,#dcdce6)'},
  // Самоцвіти (нові)
  {id:'ruby',     name:'Рубін',      accent:'#dc143c', prev:'linear-gradient(135deg,#1a0004,#4a0012)'},
  {id:'topaz',    name:'Топаз',      accent:'#ffc440', prev:'linear-gradient(135deg,#1f1600,#4a3800)'},
  {id:'opal',     name:'Опал',       accent:'#e6ccff', prev:'linear-gradient(120deg,#1a1a2a,#dcc8ff)'},
  {id:'garnet',   name:'Гранат',     accent:'#8c1e2d', prev:'linear-gradient(135deg,#1a0505,#3a0a10)'},
  {id:'turquoise',name:'Бірюза',     accent:'#40e0d0', prev:'linear-gradient(135deg,#001a1a,#003d3d)'},
  {id:'citrine',  name:'Цитрин',     accent:'#ffa528', prev:'linear-gradient(135deg,#1a1200,#4a3200)'},
  {id:'peridot',  name:'Перидот',    accent:'#b4dc3c', prev:'linear-gradient(135deg,#0f1a00,#2a3d00)'},
  // Стихії (нові)
  {id:'thunder',  name:'Грім',       accent:'#8c8cff', prev:'linear-gradient(135deg,#050510,#1a1a4a)'},
  {id:'earth',    name:'Земля',      accent:'#96aa50', prev:'linear-gradient(135deg,#0f1005,#2a2a10)'},
  {id:'volcano',  name:'Вулкан',     accent:'#ff5000', prev:'linear-gradient(160deg,#0a0000,#4a0a00)'},
  {id:'blizzard', name:'Хуртовина',  accent:'#c8e6ff', prev:'linear-gradient(150deg,#0a1420,#2a4a6a)'},
  {id:'tsunami',  name:'Цунамі',     accent:'#3c96dc', prev:'linear-gradient(150deg,#00080f,#003250)'},
  {id:'solar',    name:'Сонце',      accent:'#ffb428', prev:'linear-gradient(135deg,#1a0e00,#4a2800)'},
  {id:'void',     name:'Порожнеча', accent:'#a064dc', prev:'linear-gradient(150deg,#000,#150022)'},
  // Космос і футуризм (нові)
  {id:'nebula',   name:'Туманність', accent:'#c850ff', prev:'linear-gradient(135deg,#0a0018,#3a0050)'},
  {id:'matrix',   name:'Матриця',    accent:'#00ff50', prev:'linear-gradient(160deg,#000800,#003300)'},
  {id:'synthwave',name:'Синтвейв',   accent:'#ff2ea6', prev:'linear-gradient(120deg,#1a0028,#ff2ea6)'},
  {id:'aurora',   name:'Аврора',     accent:'#00ff9c', prev:'linear-gradient(120deg,#001a12,#00ff9c)'},
  {id:'plasma',   name:'Плазма',     accent:'#ff2ecc', prev:'linear-gradient(120deg,#1a0018,#ff2ecc)'},
  {id:'quantum',  name:'Квант',      accent:'#50b4ff', prev:'linear-gradient(135deg,#000a1a,#0050a0)'},
  // Текстури (нові)
  {id:'wood',     name:'Дерево',     accent:'#a06e3c', prev:'linear-gradient(100deg,#1f1206,#3a2410)'},
  {id:'concrete', name:'Бетон',      accent:'#a0a0a0', prev:'linear-gradient(135deg,#141414,#2e2e2e)'},
  {id:'velvet',   name:'Оксамит',    accent:'#a01478', prev:'linear-gradient(135deg,#12000f,#3a0028)'},
  {id:'silk',     name:'Шовк',       accent:'#c8beDC', prev:'linear-gradient(120deg,#1e1a24,#3a3244)'},
  {id:'brushedmetal', name:'Шліфований метал', accent:'#d2d2dc', prev:'linear-gradient(95deg,#26262a,#3e3e44)'},
  {id:'camo',     name:'Камуфляж',   accent:'#788c50', prev:'linear-gradient(120deg,#0f1a0a,#2a3318)'},
  // Особливі (нові)
  {id:'halloween',name:'Гелловін',   accent:'#ff8200', prev:'linear-gradient(135deg,#0a0000,#3a1500)'},
  {id:'valentine',name:'Валентинка', accent:'#ff3c6e', prev:'linear-gradient(135deg,#1a0008,#4a001a)'},
  {id:'easter',   name:'Великдень',  accent:'#ffd8e8', prev:'linear-gradient(120deg,#1a1420,#ffd8e8)'},
  {id:'autumn',   name:'Осінь',      accent:'#ff8c28', prev:'linear-gradient(135deg,#1a0d00,#4a2400)'},
  {id:'spring',   name:'Весна',      accent:'#78dc96', prev:'linear-gradient(135deg,#001a08,#0d3d1a)'},
  {id:'diamondelite', name:'Діамант Еліт', accent:'#e8e8f5', prev:'linear-gradient(115deg,#0a0a0f,#e8e8f5)'},
  {id:'midnight', name:'Північ',     accent:'#5050c8', prev:'linear-gradient(160deg,#000005,#050518)'},
  // Меми (тягнуться напряму з i.imgflip.com)
  {id:'meme-drake',            name:'Drake',           accent:'#fff', prev:"url('https://i.imgflip.com/30b1gx.jpg') center/cover"},
  {id:'meme-distracted',       name:'Хлопець і дівчина', accent:'#fff', prev:"url('https://i.imgflip.com/1ur9b0.jpg') center/cover"},
  {id:'meme-womancat',         name:'Жінка й кіт',     accent:'#fff', prev:"url('https://i.imgflip.com/345v97.jpg') center/cover"},
  {id:'meme-twobuttons',       name:'Дві кнопки',      accent:'#fff', prev:"url('https://i.imgflip.com/1g8my4.jpg') center/cover"},
  {id:'meme-changemymind',     name:'Переконай мене',  accent:'#fff', prev:"url('https://i.imgflip.com/24y43o.jpg') center/cover"},
  {id:'meme-successkid',       name:'Success Kid',     accent:'#fff', prev:"url('https://i.imgflip.com/1bhk.jpg') center/cover"},
  {id:'meme-doge',             name:'Doge',            accent:'#fff', prev:"url('https://i.imgflip.com/4t0m5.jpg') center/cover"},
  {id:'meme-thisisfine',       name:'This is Fine',    accent:'#fff', prev:"url('https://i.imgflip.com/wxica.jpg') center/cover"},
  {id:'meme-stonks',           name:'Stonks',          accent:'#fff', prev:"url('https://i.imgflip.com/3si4.jpg') center/cover"},
  {id:'meme-rollsafe',         name:'Roll Safe',       accent:'#fff', prev:"url('https://i.imgflip.com/1h7in3.jpg') center/cover"},
  {id:'meme-pikachu',          name:'Здивований Пікачу', accent:'#fff', prev:"url('https://i.imgflip.com/2kbn1e.jpg') center/cover"},
  {id:'meme-disastergirl',     name:'Disaster Girl',   accent:'#fff', prev:"url('https://i.imgflip.com/23ls.jpg') center/cover"},
  {id:'meme-grumpycat',        name:'Grumpy Cat',      accent:'#fff', prev:"url('https://i.imgflip.com/8p0a.jpg') center/cover"},
  {id:'meme-expandingbrain',   name:'Галактичний мозок', accent:'#fff', prev:"url('https://i.imgflip.com/1jwhww.jpg') center/cover"},
  {id:'meme-onedoesnotsimply', name:'One Does Not Simply', accent:'#fff', prev:"url('https://i.imgflip.com/1bij.jpg') center/cover"},
  {id:'meme-ancientaliens',    name:'Древні прибульці', accent:'#fff', prev:"url('https://i.imgflip.com/26am.jpg') center/cover"},
  {id:'meme-dicaprio',         name:'ДіКапріо',        accent:'#fff', prev:"url('https://i.imgflip.com/39t1o.jpg') center/cover"},
  {id:'meme-pigeon',           name:'Це голуб?',       accent:'#fff', prev:"url('https://i.imgflip.com/1o00in.jpg') center/cover"},
  {id:'meme-batman',           name:'Бетмен ляпас',    accent:'#fff', prev:"url('https://i.imgflip.com/9ehk.jpg') center/cover"},
  {id:'meme-spongebob',        name:'Губка Боб',       accent:'#fff', prev:"url('https://i.imgflip.com/1otk96.jpg') center/cover"},
  {id:'meme-sadpablo',         name:'Сумний Пабло',    accent:'#fff', prev:"url('https://i.imgflip.com/1c1uej.jpg') center/cover"},
  {id:'meme-hidethepain',      name:'Hide the Pain',   accent:'#fff', prev:"url('https://i.imgflip.com/gk5el.jpg') center/cover"},
  // Свіжі "молодіжні" тренд-меми
  {id:'meme-67kid',       name:'6-7',               accent:'#fff', prev:"url('https://i.imgflip.com/4/a9fxer.jpg') center/cover"},
  {id:'meme-skibidi',     name:'Skibidi Toilet',    accent:'#fff', prev:"url('https://i.imgflip.com/4/7mzkd0.jpg') center/cover"},
  {id:'meme-tralalero',   name:'Tralalero Tralala', accent:'#fff', prev:"url('https://i.imgflip.com/4/9p82jm.jpg') center/cover"},
  {id:'meme-bombardiro',  name:'Bombardiro Crocodilo', accent:'#fff', prev:"url('https://i.imgflip.com/4/9q3kcu.jpg') center/cover"},
  {id:'meme-tungtung',    name:'Tung Tung Sahur',   accent:'#fff', prev:"url('https://i.imgflip.com/4/9r9m7h.jpg') center/cover"},
  {id:'meme-chimpanzini', name:'Chimpanzini Bananini', accent:'#fff', prev:"url('https://i.imgflip.com/4/9r9mu1.jpg') center/cover"},
  {id:'meme-gigachad',    name:'Gigachad',          accent:'#fff', prev:"url('https://i.imgflip.com/2/6x0oo0.jpg') center/cover"},
  {id:'meme-sigma',       name:'Sigma',             accent:'#fff', prev:"url('https://i.imgflip.com/4/5imrkq.jpg') center/cover"},
  {id:'meme-chillguy',    name:'Chill Guy',         accent:'#fff', prev:"url('https://i.imgflip.com/4/9au02y.jpg') center/cover"},
  {id:'meme-ohio',        name:'Ohio',              accent:'#fff', prev:"url('https://i.imgflip.com/4/46e43q.jpg') center/cover"},
  {id:'meme-npc',         name:'NPC',               accent:'#fff', prev:"url('https://i.imgflip.com/4/2k0qad.jpg') center/cover"},
  {id:'meme-rizzler',     name:'Rizzler',           accent:'#fff', prev:"url('https://i.imgflip.com/4/93etli.jpg') center/cover"},
];

function openCardColorPicker() {
  var SKINS = CARD_SKINS;
  var CATEGORIES = [
    { name:'✨ Класика', ids:['gold','onyx','platinum','copper','minimal','silver','bronze','obsidian','steel','ivory','charcoal','chrome'] },
    { name:'💎 Самоцвіти', ids:['sapphire','emerald','amethyst','rosegold','coral','ruby','topaz','opal','garnet','turquoise','citrine','peridot'] },
    { name:'🌪️ Стихії', ids:['fire','ice','mint','storm','sunset','thunder','earth','volcano','blizzard','tsunami','solar','void'] },
    { name:'🚀 Космос і футуризм', ids:['cyber','galaxy','holo','nebula','matrix','synthwave','aurora','plasma','quantum'] },
    { name:'🪨 Текстури', ids:['carbon','marble','denim','snake','leopard','wood','concrete','velvet','silk','brushedmetal','camo'] },
    { name:'🎉 Особливі', ids:['pastel','xmas','ukraine','halloween','valentine','easter','autumn','spring','diamondelite','midnight'] },
    { name:'🎭 Меми', ids:['meme-drake','meme-distracted','meme-womancat','meme-twobuttons','meme-changemymind','meme-successkid','meme-doge','meme-thisisfine','meme-stonks','meme-rollsafe','meme-pikachu','meme-disastergirl','meme-grumpycat','meme-expandingbrain','meme-onedoesnotsimply','meme-ancientaliens','meme-dicaprio','meme-pigeon','meme-batman','meme-spongebob','meme-sadpablo','meme-hidethepain'] },
    { name:'🔥 Тренди зумерів', ids:['meme-67kid','meme-skibidi','meme-tralalero','meme-bombardiro','meme-tungtung','meme-chimpanzini','meme-gigachad','meme-sigma','meme-chillguy','meme-ohio','meme-npc','meme-rizzler'] },
  ];
  var byId = {};
  SKINS.forEach(function(s) { byId[s.id] = s; });
  var _act = getActiveCardObj();
  var current = (_act && _act.skin) || (!_act && userData.pendingCardSkin) || 'onyx';
  function swatchHtml(s) {
    var active = current === s.id;
    return '<div onclick="applyCardSkin(\'' + s.id + '\')" class="skin-swatch' + (active?' active':'') + '" style="background:' + s.prev + ';border-color:' + (active ? s.accent : 'rgba(255,255,255,.08)') + ';color:' + s.accent + ';">' +
      (active ? '<div class="skin-swatch-check">✓</div>' : '') +
      '<div style="font-size:10px;font-weight:700;margin-top:26px;color:' + s.accent + ';text-shadow:0 1px 3px rgba(0,0,0,.8);">' + s.name + '</div>' +
      '</div>';
  }
  var uploadActive = current === 'custom-photo';
  var html = modalCloseBtn('cardskin') +
    '<div style="font-family:Orbitron,monospace;font-size:13px;color:#d4af37;margin-bottom:4px;padding-right:36px;">🎨 Скін картки</div>' +
    '<div style="font-size:11px;color:#555;margin-bottom:14px;">' + SKINS.length + ' унікальних дизайнів у ' + (CATEGORIES.length + 1) + ' категоріях</div>' +
    '<div style="font-size:11px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">📷 Персональне</div>' +
    '<div onclick="uploadCustomCardPhoto()" class="skin-swatch' + (uploadActive?' active':'') + '" style="background:linear-gradient(135deg,rgba(212,175,55,.12),rgba(212,175,55,.03));border:1.5px dashed rgba(212,175,55,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:80px;color:#d4af37;margin-bottom:6px;">' +
    (uploadActive ? '<div class="skin-swatch-check">✓</div>' : '') +
    '<div style="font-size:20px;">📷</div><div style="font-size:11px;font-weight:700;">Завантажити своє фото</div>' +
    '</div>' +
    '<div style="max-height:60vh;overflow-y:auto;">' +
    CATEGORIES.map(function(cat) {
      return '<div style="font-size:11px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px;">' + cat.name + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">' +
        cat.ids.filter(function(id){ return byId[id]; }).map(function(id){ return swatchHtml(byId[id]); }).join('') +
        '</div>';
    }).join('') +
    '</div>';
  openModal('cardskin', html);
}

// Показує/прибирає особисте фото поверх скіна — inline style, бо це унікальні
// дані користувача (не спільний CSS-клас, як решта скінів)
function applyCardPhotoBg(el, skin, photoUrl) {
  if(!el) return;
  // #vcardEl — це зовнішня обгортка з .vcard-front І .vcard-back дітьми (для
  // фліпу картки). Раніше фон ставився на неї саму — тому просвічувався лише
  // крізь .vcard-back (у якого немає власного opaque background), а лицьова
  // сторона лишалась поверх зі своїм стандартним фоном. Треба ставити саме
  // на .vcard-front.
  var front = el.classList && el.classList.contains('vcard-front') ? el : el.querySelector('.vcard-front');
  if(!front) return;
  if(skin === 'custom-photo' && photoUrl) {
    front.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.55)), url(' + photoUrl + ')';
    front.style.backgroundSize = 'cover';
    front.style.backgroundPosition = 'center';
  } else {
    front.style.backgroundImage = '';
    front.style.backgroundSize = '';
    front.style.backgroundPosition = '';
  }
}

function uploadCustomCardPhoto() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = function() {
    var file = input.files && input.files[0];
    if(!file) return;
    if(file.size > 8 * 1024 * 1024) return notify('Фото завелике (макс 8МБ)', 'error');
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        // Стискаємо до розумного розміру перед збереженням у Firebase
        var maxW = 500;
        var scale = Math.min(1, maxW / img.width);
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.75);

        var cardEl = document.getElementById('vcardEl');
        if(cardEl) { cardEl.className = 'vcard vcard-skin-custom-photo'; applyCardPhotoBg(cardEl, 'custom-photo', dataUrl); }

        var t = _activeSkinTarget();
        if(t.base && t.local) {
          t.local.skin = 'custom-photo'; t.local.customPhotoUrl = dataUrl;
          db.ref('users/' + currentUser + '/' + t.base + '/skin').set('custom-photo');
          db.ref('users/' + currentUser + '/' + t.base + '/customPhotoUrl').set(dataUrl);
        } else {
          userData.pendingCardSkin = 'custom-photo';
          userData.pendingCardPhotoUrl = dataUrl;
          db.ref('users/' + currentUser + '/pendingCardSkin').set('custom-photo');
          db.ref('users/' + currentUser + '/pendingCardPhotoUrl').set(dataUrl);
        }
        notify('📷 Фото застосовано як скін картки!', 'success');
        closeModal('cardskin');
        renderCardPanel();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// Скін пишеться на АКТИВНУ картку (linkedCards/<id> або virtualCard), а до
// підключення першої картки — у тимчасовий pendingCardSkin.
function _activeSkinTarget() {
  var a = getActiveCardObj();
  if(a && a.kind === 'axiom') return { base: 'virtualCard', local: userData.virtualCard };
  if(a && userData.linkedCards && userData.linkedCards[a.id]) return { base: 'linkedCards/' + a.id, local: userData.linkedCards[a.id] };
  return { base: null, local: null }; // ще немає картки
}

function applyCardSkin(skinId) {
  var cardEl = document.getElementById('vcardEl');
  if(cardEl) { cardEl.className = 'vcard vcard-skin-' + skinId; applyCardPhotoBg(cardEl, skinId, null); }
  var t = _activeSkinTarget();
  if(t.base && t.local) {
    t.local.skin = skinId; t.local.customPhotoUrl = '';
    db.ref('users/' + currentUser + '/' + t.base + '/skin').set(skinId);
    db.ref('users/' + currentUser + '/' + t.base + '/customPhotoUrl').remove();
  } else {
    userData.pendingCardSkin = skinId;
    db.ref('users/' + currentUser + '/pendingCardSkin').set(skinId);
  }
  notify('🎨 Скін застосовано!', 'success');
  closeModal('cardskin');
  renderCardPanel();
}

