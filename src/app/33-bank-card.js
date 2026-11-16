// ============================================================
// ╔══════════════════════════════════════════════════════════╗
// ║          SLOTOK BANK & VIRTUAL CARD SYSTEM               ║
// ╚══════════════════════════════════════════════════════════╝
// ============================================================

// ── GENERATE UNIQUE CARD NUMBER ──
// ════════════════════════════════════════════════
// ═══ ІГРОВІ КАРТКИ SlotOK (внутрішні, без зовнішніх банків)
// ════════════════════════════════════════════════

// ── CARD DATA ──
// Єдина точка правди: яка картка зараз активна.
// Картки з повними даними (номер + CVV) — лише згенеровані ігрові «Партнер»-картки.
// Решта карток зберігається замасковано (банк + останні 4 цифри) —
// повний перелік підключеного дає getLinkedCards().
function getActiveCard() {
  if(!userData) return null;
  var a = getActiveCardObj();
  if(a && (a.kind === 'partner') && a.cvv) return a;
  // навіть якщо активна — звичайна картка, CVV може мати згенерована Партнер
  var cards = getLinkedCards();
  for(var i=0;i<cards.length;i++) if((cards[i].kind === 'partner') && cards[i].active && cards[i].cvv) return cards[i];
  return (a && a.cvv) ? a : null;
}

function getCardData() {
  if(!userData || !currentUser) return null;
  const card = getActiveCard();
  if(!card || !card.number) return null;
  return card;
}

function dismissCardOnboard() {
  document.getElementById('cardOnboardModal').classList.add('hidden');
  localStorage.setItem('cardOnboardDismissed_'+currentUser, '1');
}

// ── CARD ONBOARD CHECK ──
function checkCardOnboarding() {
  if(!currentUser || !userData) return;
  // Нагадуємо лише тим, у кого немає ЖОДНОЇ підключеної картки
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


