// ============================================================
// Спільний вигляд ігрових екранів (редизайн «Нічна друкарня»).
// Розмітка ігор історично різна; щоб ставка й головна кнопка всюди
// читались однаково, тут при завантаженні:
//  • кожне поле ставки обгортається в .bet-field: підпис «Ставка», ваш
//    баланс, кнопки ½ / ×2 і швидкі суми (через наявний setQuickBet);
//  • головна кнопка гри отримує клас .game-cta (велика, акцентна).
// Самі input/кнопки (id, onclick) не змінюються — логіка ігор та сама.
// ============================================================
const BET_INPUT_IDS = [
  'betAmountSlots', 'betAmountDiamond', 'grBetAmount', 'betAmountCrash', 'betAmountPoker', 'betAmountChests',
  'betAmountMines', 'betAmountPlinko', 'towerBet', 'hiloBet', 'diceBet', 'doubleBet', 'betAmountBJ',
  'betAmountKeno', 'betAmountScratch', 'limboAmount', 'betAmountFortune', 'betAmountHR', 'betAmountColor',
  'betAmountBalloon', 'betAmountRR', 'betAmountQuiz', 'bacBet', 'vpBet', 'dragonBet',
  'sicboBet', 'cwBet', 'cfBetInput', 'rpsBetInput', 'pdBetInput',
  'monoEntryBet', 'mpBetInput', 'cgBet', 'chessBetAmount',
  'p3dBet', 'w3dBet', 'crBet', 's5Bet', 'm3Bet', 'msBet', 'bsBet', 'lwBet', 'lcBet',
];
const GAME_CTA_FNS = [
  'spinSlots', 'spinDiamondSlots', 'lwPlaceBet', 'lcAction', 'startCrash', 'dealPoker', 'startChests', 'startMines',
  'dropPlinko', 'startTower', 'startHilo', 'rollDice', 'bjDeal', 'playKeno', 'buyScratch', 'playLimbo',
  'spinFortune', 'startHorseRace', 'spinColorWheel', 'startBalloon', 'startQuiz', 'vpDeal', 'startDragonTower',
  'rollSicBo', 'playCardWar', 'createCfRoom', 'createRpsRoom',
  'createPdRoom', 'startMonopoly', 'createMpRoom', 'startCardGame', 'chessStartFromSetup',
  'playPlinko3d', 'playWheel3d', 'playCraps', 'playSlot5', 'playMatch3', 'msDuelCreate', 'bsOnlineCreate',
];
const BET_CHIPS = [10, 50, 100, 500, 1000];

function enhanceBetInput(input) {
  if (!input || input.closest('.bet-field')) return;
  const id = input.id;
  // Старий підпис «Ставка» поруч з полем — тепер він усередині .bet-field
  const prev = input.previousElementSibling;
  if (prev && !prev.querySelector('input,select,button') && /ставк/i.test(prev.textContent || '') && (prev.textContent || '').length < 40) prev.remove();
  const wrap = document.createElement('div');
  wrap.className = 'bet-field';
  input.parentNode.insertBefore(wrap, input);
  input.style.margin = '';
  input.style.marginBottom = '';
  input.classList.add('bet-input');
  input.setAttribute('inputmode', 'numeric');
  if (!input.getAttribute('min')) input.setAttribute('min', '1');
  const chip = (v, label, cls) =>
    `<button type="button" class="bet-chip${cls ? ' ' + cls : ''}" onclick="setQuickBet('${id}', ${typeof v === 'number' ? v : `'${v}'`})">${label}</button>`;
  wrap.innerHTML = `
    <div class="bet-field-head">
      <label class="field-label" for="${id}">Ставка</label>
      <span class="bet-field-bal">Баланс: <span class="bal">${typeof formatCurrency === 'function' && userData && userData.balance !== undefined ? formatCurrency(userData.balance) : '—'}</span></span>
    </div>
    <div class="bet-input-row">
      <button type="button" class="bet-step" onclick="setQuickBet('${id}','half')" aria-label="Зменшити ставку вдвічі">½</button>
      <span class="bet-input-wrap"><span class="bet-cur" aria-hidden="true">₴</span></span>
      <button type="button" class="bet-step" onclick="setQuickBet('${id}','double')" aria-label="Подвоїти ставку">×2</button>
    </div>
    <div class="bet-chips" role="group" aria-label="Швидка ставка">
      ${BET_CHIPS.map((v) => chip(v, v >= 1000 ? v / 1000 + 'k' : String(v))).join('')}${chip('max', 'MAX', 'is-max')}
    </div>`;
  wrap.querySelector('.bet-input-wrap').appendChild(input);
  // Якщо поле стояло в одному ряду з іншими полями (сітка/флекс) — виносимо
  // ставку окремим блоком над рядом: на телефоні їй потрібна вся ширина.
  for (let node = wrap.parentElement; node && !node.classList.contains('screen'); node = node.parentElement) {
    const st = getComputedStyle(node);
    const isRow = (st.display.includes('flex') && !st.flexDirection.startsWith('column')) ||
      (st.display.includes('grid') && st.gridTemplateColumns.split(' ').length > 1);
    if (!isRow) continue;
    const cell = [...node.children].find((c) => c.contains(wrap));
    node.parentNode.insertBefore(wrap, node);
    if (cell && cell !== wrap && !cell.querySelector('input,select,button,canvas') && !(cell.textContent || '').trim()) cell.remove();
    break;
  }
}

function enhanceGameScreens() {
  BET_INPUT_IDS.forEach((id) => enhanceBetInput(document.getElementById(id)));
  document.querySelectorAll('.screen button[onclick]').forEach((b) => {
    const fn = (b.getAttribute('onclick') || '').trim().split('(')[0];
    if (GAME_CTA_FNS.includes(fn)) b.classList.add('game-cta');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceGameScreens);
else enhanceGameScreens();
