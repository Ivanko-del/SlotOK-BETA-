// ╔══════════════════════════════════════════════════════════════╗
// ║  Пенальті, Наперстки, Дартс (v122)                            ║
// ║  Результат і виплату рахує сервер (lib/games.js: penalty,     ║
// ║  cups, darts через api/play). Без сервера ці ігри недоступні: ║
// ║  нові ігри більше не рахуємо в браузері.                      ║
// ╚══════════════════════════════════════════════════════════════╝

// Ті самі множники, що в lib/games.js (тест звіряє RTP там).
const PEN_MULT = { 1: 1.16, 2: 1.45, 3: 1.94, 4: 2.91 };
const CUPS_MULT = { 3: 2.88, 4: 3.84, 5: 4.8 };
const DARTS_RINGS = [
  { id: 'eye',    label: 'Яблучко',       mult: 20,  chance: '0,6%' },
  { id: 'bull',   label: 'Центр',         mult: 5,   chance: '3,4%' },
  { id: 'treble', label: 'Потрійне коло', mult: 2,   chance: '11%' },
  { id: 'inner',  label: 'Внутрішнє поле', mult: 1.2, chance: '25%' },
  { id: 'outer',  label: 'Зовнішнє поле', mult: 0.5, chance: '30%' },
  { id: 'miss',   label: 'Повз дошку',    mult: 0,   chance: '30%' },
];
const PEN_ZONE_NAMES = ['верхній лівий', 'верхній центр', 'верхній правий', 'нижній лівий', 'нижній центр', 'нижній правий'];

let _penZone = 0, _penKeepers = 2, _cupsN = 3, _cupsPick = 0;
const _ngBusy = {};

function ngSegHtml(values, current, fn, label) {
  return values.map(v => `<button type="button" class="seg-item${v === current ? ' active' : ''}" role="radio" aria-checked="${v === current}" onclick="${fn}(${v})"><span class="seg-label">${label(v)}</span></button>`).join('');
}

// Спільне: ставка через сервер, облік і результат.
async function ngPlay(game, inputId, params, label) {
  if(_ngBusy[game]) return null;
  const bet = validateBet(document.getElementById(inputId).value);
  if(!bet) return null;
  if(!(await serverAuthEnabled())) { notify('Ця гра працює лише з сервером', 'error'); return null; }
  _ngBusy[game] = true;
  try {
    const srv = await serverPlay(game, bet, params);
    if(srv.mode !== 'server') return null;
    addWager(bet); trackQuest('totalGames', 1); trackQuest('weekWager', bet);
    trackLbStat('wager', bet); trackLbStat('games', 1);
    publishLiveBet(label, '🎯', bet, '');
    return { bet, r: srv.r };
  } finally { _ngBusy[game] = false; }
}

function ngFinish(label, bet, r) {
  if(r.win) {
    playSound(r.mult >= 5 ? 'bonus' : 'win');
    trackLbStat('wins', r.payout); trackLbStat('profit', r.payout - bet);
    addToHistory(label + ': +' + r.payout + ' (×' + r.mult + ')');
    if(r.payout >= 1000) addToWinFeed(label, r.payout, r.mult);
    try { triggerWinReaction(r.payout, label); } catch(e) {}
  } else {
    playSound('loss');
    addToHistory(label + ': -' + bet);
  }
  updateStreak(!!r.win);
}

// ── Пенальті ──
function initPenalty() {
  const goal = document.getElementById('penGoal');
  if(goal) goal.innerHTML = PEN_ZONE_NAMES.map((n, i) => `<button type="button" class="pen-zone${i === _penZone ? ' is-aim' : ''}" role="radio" aria-checked="${i === _penZone}" aria-label="${n} кут" onclick="penAim(${i})"></button>`).join('');
  const k = document.getElementById('penKeepers');
  if(k) k.innerHTML = ngSegHtml([1, 2, 3, 4], _penKeepers, 'penSetKeepers', v => v + ' · ×' + PEN_MULT[v]);
}
function penAim(i) { if(_ngBusy.penalty) return; _penZone = i; initPenalty(); }
function penSetKeepers(v) { if(_ngBusy.penalty) return; _penKeepers = v; initPenalty(); }

async function playPenalty() {
  const res = document.getElementById('penResult');
  const done = await ngPlay('penalty', 'penBet', { zone: _penZone, keepers: _penKeepers }, 'Пенальті');
  if(!done) return;
  const { bet, r } = done;
  initPenalty();
  const zones = document.querySelectorAll('#penGoal .pen-zone');
  r.saved.forEach(i => zones[i] && zones[i].classList.add('is-saved'));
  if(zones[r.zone]) zones[r.zone].classList.add(r.win ? 'is-goal' : 'is-blocked');
  if(res) res.innerHTML = r.win
    ? `<span class="is-pos">Гол! +${formatNumber(r.payout)} ₴</span>`
    : `<span class="is-neg">Воротар відбив</span>`;
  ngFinish('Пенальті', bet, r);
}

// ── Наперстки ──
function initCups() {
  if(_cupsPick >= _cupsN) _cupsPick = 0;
  const row = document.getElementById('cupsRow');
  if(row) row.innerHTML = Array.from({ length: _cupsN }, (_, i) => `<button type="button" class="cup${i === _cupsPick ? ' is-pick' : ''}" role="radio" aria-checked="${i === _cupsPick}" aria-label="Наперсток ${i + 1}" onclick="cupsPick(${i})"><span class="cup-ball"></span></button>`).join('');
  const c = document.getElementById('cupsCount');
  if(c) c.innerHTML = ngSegHtml([3, 4, 5], _cupsN, 'cupsSetCount', v => v + ' · ×' + CUPS_MULT[v]);
}
function cupsPick(i) { if(_ngBusy.cups) return; _cupsPick = i; initCups(); }
function cupsSetCount(n) { if(_ngBusy.cups) return; _cupsN = n; initCups(); }

async function playCups() {
  const res = document.getElementById('cupsResult');
  const done = await ngPlay('cups', 'cupsBet', { cups: _cupsN, pick: _cupsPick }, 'Наперстки');
  if(!done) return;
  const { bet, r } = done;
  initCups();
  const cups = document.querySelectorAll('#cupsRow .cup');
  if(cups[r.ball]) cups[r.ball].classList.add('has-ball');
  cups.forEach(c => c.classList.add('is-up'));
  if(res) res.innerHTML = r.win
    ? `<span class="is-pos">Вгадав! +${formatNumber(r.payout)} ₴</span>`
    : `<span class="is-neg">Кулька була під наперстком ${r.ball + 1}</span>`;
  ngFinish('Наперстки', bet, r);
}

// ── Дартс ──
// Радіус точки влучання (у % від половини дошки) для кожного сектора.
const DARTS_RADIUS = { eye: [0, 4], bull: [5, 11], treble: [13, 22], inner: [24, 60], outer: [62, 92], miss: [96, 112] };
function initDarts() {
  const lg = document.getElementById('dartsLegend');
  if(lg && !lg.dataset.built) {
    lg.innerHTML = DARTS_RINGS.map(x => `<div class="list-row"><span class="list-row-main"><span class="list-row-title">${x.label}</span><span class="list-row-sub">шанс ${x.chance}</span></span><span class="badge num">×${x.mult}</span></div>`).join('');
    lg.dataset.built = '1';
  }
}

async function throwDart() {
  const res = document.getElementById('dartsResult');
  const dart = document.getElementById('dartsDart');
  const done = await ngPlay('darts', 'dartsBet', {}, 'Дартс');
  if(!done) return;
  const { bet, r } = done;
  const [a, b] = DARTS_RADIUS[r.ring] || [0, 0];
  const rad = a + Math.random() * (b - a);
  const ang = (r.angle || 0) * Math.PI / 180;
  if(dart) {
    dart.style.left = (50 + Math.cos(ang) * rad / 2) + '%';
    dart.style.top = (50 + Math.sin(ang) * rad / 2) + '%';
    dart.classList.remove('hidden');
  }
  const ring = DARTS_RINGS.find(x => x.id === r.ring) || { label: '' };
  if(res) res.innerHTML = r.win
    ? `<span class="${r.mult >= 1 ? 'is-pos' : ''}">${ring.label} · ×${r.mult} · +${formatNumber(r.payout)} ₴</span>`
    : `<span class="is-neg">${ring.label}</span>`;
  ngFinish('Дартс', bet, r);
}
