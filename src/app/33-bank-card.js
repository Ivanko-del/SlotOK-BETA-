// ============================================================
// ╔══════════════════════════════════════════════════════════╗
// ║          SLOTOK BANK & VIRTUAL CARD SYSTEM               ║
// ╚══════════════════════════════════════════════════════════╝
// ============================================================

// ── GENERATE UNIQUE CARD NUMBER ──
// ════════════════════════════════════════════════
// ═══ AXIOM BANK CARD INTEGRATION (no self-issue)
// ════════════════════════════════════════════════

// ── CARD DATA ──
// Єдина точка правди: яка картка зараз активна — справжня (Axioma) чи тимчасова партнерська.
// Раніше багато місць коду перевіряли лише userData.virtualCard напряму, тому CVV/блокування/
// заморозка мовчки не працювали для більшості гравців (у них саме тимчасова картка).
// Єдина картка з повними даними — прив'язана картка Аксіоми: лише в неї є
// номер і CVV. Свої зовнішні картки гравця зберігаються замасковано (банк +
// останні 4 цифри), тому «активною карткою» в цьому сенсі не є —
// повний перелік підключеного дає getLinkedCards().
// Активна картка з повними даними (номер + CVV) — Аксіома або згенерована
// Партнер-картка. Свої підключені картки повних даних не мають.
function getActiveCard() {
  if(!userData) return null;
  var a = getActiveCardObj();
  if(a && (a.kind === 'axiom' || a.kind === 'partner') && a.cvv) return a;
  // навіть якщо активна — звичайна картка, CVV може мати згенерована Партнер
  var cards = getLinkedCards();
  for(var i=0;i<cards.length;i++) if((cards[i].kind === 'axiom' || cards[i].kind === 'partner') && cards[i].active && cards[i].cvv) return cards[i];
  return (a && a.cvv) ? a : null;
}

function getCardData() {
  if(!userData || !currentUser) return null;
  const card = getActiveCard();
  if(!card || !card.number) return null;
  return card;
}

// ── Real-time freeze sync: Axiom freeze → SlotOK freeze ──
let _freezeSyncListener = null;
function startAxiomFreezeSync() {
  if(_freezeSyncListener) return; // already running
  _freezeSyncListener = db.ref('users/' + currentUser + '/virtualCard/frozen').on('value', snap => {
    const frozen = snap.val();
    // Just re-render card panel to show updated state
    if(typeof renderCardPanel === 'function') setTimeout(renderCardPanel, 200);
    if(frozen === true) {
      // Show warning if user is active
      if(document.getElementById('cashier-panel-card') && !document.getElementById('cashier-panel-card').classList.contains('hidden')) {
        notify('🔒 Картку заблоковано в Аксіомі! Операції недоступні.', 'error');
      }
    }
  });
}

function dismissCardOnboard() {
  document.getElementById('cardOnboardModal').classList.add('hidden');
  localStorage.setItem('cardOnboardDismissed_'+currentUser, '1');
}

// ── CARD ONBOARD CHECK ──
function checkCardOnboarding() {
  if(!currentUser || !userData) return;
  // Нагадуємо лише тим, у кого немає ЖОДНОЇ підключеної картки: своя зовнішня
  // картка так само знімає гейт, як і прив'язка Аксіоми
  if(hasConnectedCard()) return;
  const dismissed = localStorage.getItem('cardOnboardDismissed_'+currentUser);
  if(dismissed) return;
  setTimeout(() => {
    document.getElementById('cardOnboardModal')?.classList.remove('hidden');
  }, 2500);
}

// ── RENDER CARD PANEL ──
let cvvVisible = false;

// ── BANK ACTIONS ──

// ── CARD TRANSACTIONS ──
// Кожен запис стрічки прив'язаний до картки, на яку гроші реально лягли (чи з
// якої пішли). Без цього історія активної картки показувала б операції всього
// гаманця — і баланс картки не сходився б з її ж списком операцій.
// Усі записи в cardTx мають іти через цю функцію, інакше операція загубиться
// в «нічийних» і висітиме в історії всіх карток одразу.
function pushCardTx(user, tx, cardId) {
  if(!db || !user) return;
  if(cardId) tx.cardId = cardId;
  if(!tx.ts) tx.ts = Date.now();
  db.ref('users/'+user+'/cardTx').push(tx);
}
function addCardTransaction(direction, amount, title, subtitle) {
  if(!currentUser) return;
  pushCardTx(currentUser, { dir: direction, amount: amount, title: title, subtitle: subtitle || '' }, getActiveCardId());
}

// ── Переказ SlotOK ↔ Аксіома Банк ──
// Гроші картки Аксіоми лежать у базі Аксіоми. «Поповнити з Аксіоми» списує з
// картки (транзакцією, з її блокуванням і денним лімітом) і зараховує на
// ігровий баланс; «Вивести на Аксіому» — навпаки. Якщо друга половина не
// пройшла, першу повертаємо.
let axiomTxDir = 'toCasino';
let _axiomTxBusy = false;
function setAxiomTxDir(dir) {
  axiomTxDir = dir === 'toAxiom' ? 'toAxiom' : 'toCasino';
  const a = document.getElementById('axiomTxDirA');
  const b = document.getElementById('axiomTxDirB');
  const btn = document.getElementById('axiomTxBtn');
  if(!a || !b) return;
  const on = axiomTxDir === 'toCasino' ? b : a, off = on === a ? b : a;
  on.style.background = 'rgba(92,110,248,.15)'; on.style.border = '1px solid rgba(92,110,248,.35)'; on.style.color = '#7c8eff';
  off.style.background = 'transparent'; off.style.border = 'none'; off.style.color = '#555';
  if(btn) btn.textContent = axiomTxDir === 'toCasino' ? '🎰 Поповнити гру з картки' : '🏦 Вивести на картку Аксіоми';
}
function setAxiomTxAmt(n) {
  const inp = document.getElementById('axiomTxAmt');
  if(inp) inp.value = n;
}
function openAxiomTransfer(dir) {
  if(!axLinked()) { openAxiomLinkFlow(); return; }
  openTabModal('axiomTransferModal');
  setAxiomTxDir(dir);
  updateAxiomTransferModal();
}
function updateAxiomTransferModal() {
  const s = document.getElementById('axiomTxSlotBal');
  const a = document.getElementById('axiomTxAxBal');
  if(s && userData) s.textContent = '₴ ' + formatNumber(userData.balance || 0);
  if(a) a.textContent = _axAcc ? '₴ ' + formatNumber(_axAcc.card.balance) : '—';
}
async function doAxiomTransfer() {
  if(_axiomTxBusy) return;
  const amt = Math.round((parseFloat(document.getElementById('axiomTxAmt')?.value) || 0) * 100) / 100;
  if(!amt || amt < 10) return notify('Мінімум ₴10', 'error');
  if(!axLinked()) return notify('Спершу підключи Аксіома Банк', 'error');
  const btn = document.getElementById('axiomTxBtn');
  _axiomTxBusy = true;
  if(btn) btn.disabled = true;
  try {
    if(axiomTxDir === 'toAxiom') {
      if(isActiveCardFrozen()) return notify('🔒 Активна картка заблокована — розблокуй її в Касі', 'error');
      if(!checkCardLimit(getActiveCardId(), amt)) return;
      const res = await db.ref('users/' + currentUser + '/balance').transaction(cur => {
        const v = Number(cur) || 0;
        if(v + 1e-9 < amt) return;
        return Math.round((v - amt) * 100) / 100;
      }, undefined, false);
      if(!res.committed) return notify('Недостатньо коштів у SlotOK', 'error');
      try {
        await AxiomaSDK.depositToCard(amt, { project: 'slotok', title: 'Виведення зі SlotOK', subtitle: '@' + currentUser });
      } catch(e) {
        db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(amt));
        return notify('❌ ' + (e.axioma ? e.message : 'Аксіома не відповідає — гроші повернуто'), 'error');
      }
      noteCardSpend(getActiveCardId(), amt);
      pushCardTx(currentUser, { title: 'Виведення → Аксіома Банк', subtitle: '····' + _axAcc.card.last4, amount: amt, dir: 'out' }, getActiveCardId());
      notify('✅ ₴' + formatNumber(amt) + ' виведено на картку Аксіоми', 'success');
    } else {
      try {
        await AxiomaSDK.withdrawFromCard(amt, { project: 'slotok', title: 'Поповнення SlotOK', subtitle: '@' + currentUser });
      } catch(e) {
        return notify('❌ ' + (e.axioma ? e.message : 'Аксіома не відповідає. Спробуй ще раз'), 'error');
      }
      try {
        await db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(amt));
      } catch(e) {
        AxiomaSDK.depositToCard(amt, { project: 'slotok', title: 'Повернення: SlotOK' }).catch(err => console.error(err));
        return notify('❌ Не вдалося зарахувати — гроші повернуто на картку Аксіоми', 'error');
      }
      pushCardTx(currentUser, { title: 'Поповнення ← Аксіома Банк', subtitle: '····' + _axAcc.card.last4, amount: amt, dir: 'in' }, getActiveCardId());
      notify('✅ ₴' + formatNumber(amt) + ' надійшло з Аксіоми', 'success');
    }
    closeTabModal('axiomTransferModal');
  } finally {
    _axiomTxBusy = false;
    if(btn) btn.disabled = false;
  }
}

function openTelegramBotWithCard() {
  const card = getCardData();
  const cardInfo = card ? `Картка: ${card.number}` : '';
  const userId = userData.id || currentUser;
  const url = `https://t.me/SlotOK_DepositBot?start=deposit_${userId}`;
  window.open(url, '_blank');
  closeTabModal('cardTopupModal');
}

function selectCardTopupAmt(amt, btn) {
  document.querySelectorAll('.amount-btn').forEach(b=>b.classList.remove('selected'));
  if(btn) btn.classList.add('selected');
  const inp = document.getElementById('cardTopupAmount');
  if(inp) inp.value = amt;
}


