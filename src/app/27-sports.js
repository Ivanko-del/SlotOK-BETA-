// ============================================================
// ===== СТАВКИ НА СПОРТ ПРИБРАНО =====
// ============================================================
// Розділ спортивних ставок видалено повністю. Лишилась одна одноразова
// процедура: відкриті (нерозраховані) ставки гравця повертаються на баланс.
// Безпечна до подвійного повернення: ставка спершу «забирається» транзакцією
// pending → refunded (виграє лише один виклик, навіть із двох вкладок), і
// тільки після цього гроші йдуть на баланс.
const SPORT_REFUND_NOTICE = 'Ставки на спорт прибрано, ставку повернуто';

function refundOpenSportBets() {
  if(!db || !currentUser) return;
  const me = currentUser;
  if(refundOpenSportBets._busy) return;
  if(userData && userData.sportRefundDone) return;
  refundOpenSportBets._busy = true;
  db.ref('sport_bets').orderByChild('userId').equalTo(me).once('value').then(snap => {
    const bets = snap.val() || {};
    const open = Object.keys(bets).filter(id => bets[id] && bets[id].status === 'pending');
    return Promise.all(open.map(id => {
      const amount = Math.floor(Number(bets[id].amount) || 0);
      return new Promise(resolve => {
        db.ref('sport_bets/' + id + '/status').transaction(cur => (cur === 'pending' ? 'refunded' : (cur === null ? null : undefined)), (err, committed) => resolve(!err && committed));
      }).then(committed => {
        if(!committed) return 0;
        db.ref('sport_bets/' + id + '/refundedAt').set(Date.now()).catch(() => {});
        if(amount <= 0) return 0;
        return db.ref('users/' + me + '/balance').set(firebase.database.ServerValue.increment(amount)).then(() => amount);
      });
    }));
  }).then(list => {
    const total = (list || []).reduce((a, b) => a + (b || 0), 0);
    if(total > 0) {
      notify('↩️ ' + SPORT_REFUND_NOTICE + ': +' + formatNumber(total) + ' ₴', 'success');
      if(typeof addToHistory === 'function') addToHistory('Повернення спортивних ставок: +' + total);
    }
    // Усе опрацьовано (навіть коли відкритих ставок не було) — більше не питаємо базу.
    return db.ref('users/' + me + '/sportRefundDone').set(true);
  }).catch(e => console.error('sport refund:', e)).then(() => { refundOpenSportBets._busy = false; });
}
