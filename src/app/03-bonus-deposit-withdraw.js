// ============================================
// ЩОДЕННИЙ БОНУС
// ============================================

function checkDailyBonus() {
    const lastClaim = userData.lastDailyBonus || 0;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const canClaim = (now - lastClaim) >= dayMs;
    
    const banner = document.getElementById('dailyBonusBanner');
    if(canClaim) {
        banner.style.display = 'flex';
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

function openDailyBonus() {
    const lastClaim = userData.lastDailyBonus || 0;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const canClaim = (now - lastClaim) >= dayMs;
    const streak = userData.dailyStreak || 0;
    const bonusAmount = DAILY_BONUSES[Math.min(streak, 6)];
    
    const content = document.getElementById('dailyBonusContent');
    
    if(canClaim) {
        content.innerHTML = `
            <div class="bonus-icon">🎁</div>
            <h2 style="color:var(--accent);">Щоденний Бонус!</h2>
            <div style="color:var(--fg-2); margin-bottom:10px;">День ${streak + 1} серії</div>
            <div class="bonus-amount">+${bonusAmount} ₴</div>
            <div class="streak-dots">
                ${DAILY_BONUSES.map((b, i) => `
                    <div class="streak-dot ${i < streak ? 'done' : i === streak ? 'today' : ''}" title="${b}₴">
                        ${i < streak ? '✓' : i === streak ? '★' : i+1}
                    </div>
                `).join('')}
            </div>
            <div style="color:var(--fg-2); font-size:12px; margin-bottom:20px;">7 днів поспіль = 1000₴</div>
            <button class="btn-gold" style="font-size:18px; padding:18px;" onclick="claimDailyBonus(${bonusAmount})">
                🎁 ЗАБРАТИ ${bonusAmount} ₴
            </button>
        `;
    } else {
        const msLeft = dayMs - (now - lastClaim);
        const h = Math.floor(msLeft / 3600000);
        const m = Math.floor((msLeft % 3600000) / 60000);
        content.innerHTML = `
            <div style="font-size:60px; margin-bottom:20px;">⏰</div>
            <h2 style="color:var(--fg-3);">Вже забрано</h2>
            <div style="color:var(--fg-2); margin-bottom:10px;">Наступний бонус через:</div>
            <div style="font-size:36px; font-weight:900; color:var(--accent);">${h}год ${m}хв</div>
            <div style="color:var(--fg-2); margin:15px 0; font-size:13px;">Ваша серія: ${streak} днів 🔥</div>
            <div class="streak-dots">
                ${DAILY_BONUSES.map((b, i) => `
                    <div class="streak-dot ${i < streak ? 'done' : ''}" title="${b}₴">
                        ${i < streak ? '✓' : i+1}
                    </div>
                `).join('')}
            </div>
            <button class="btn-outline" onclick="closeTabModal('daily-bonus-modal')" style="margin-top:20px;">Закрити</button>
        `;
    }
    openTabModal('daily-bonus-modal');
}

async function claimDailyBonus(amount) {
    const srv = await serverReward('daily');
    if(srv.mode === 'error') {
        if(srv.status === 409) { closeTabModal('daily-bonus-modal'); document.getElementById('dailyBonusBanner').classList.add('hidden'); }
        return;
    }
    if(srv.mode === 'server') {
        const r = srv.r;
        pushCardTx(currentUser, {dir:'in', amount:r.amount, title:'Щоденний бонус', subtitle:'День '+r.day+' серії', icon:'🎁'}, getActiveCardId());
        if(r.streakBonus) notify(`🔥 7 днів поспіль! +${r.streakBonus} ₴`, 'success');
        playSound('win');
        const multText = r.vip.mult > 1 ? ` (${r.vip.icon} VIP ×${r.vip.mult})` : '';
        notify(`🎁 Щоденний бонус: +${r.amount} ₴${multText}`, 'success');
        addToHistory(`Daily Bonus: +${r.amount}`);
        closeTabModal('daily-bonus-modal');
        document.getElementById('dailyBonusBanner').classList.add('hidden');
        return;
    }
    const streak = (userData.dailyStreak || 0) + 1;
    const newStreak = streak >= 7 ? 0 : streak;
    // VIP множник
    const vip = getVipLevel(userData.totalWagered || 0);
    const finalAmount = Math.floor(amount * vip.dailyMult);
    
    db.ref('users/' + currentUser).update({
        balance: userData.balance + finalAmount,
        lastDailyBonus: Date.now(),
        dailyStreak: newStreak
    });
    pushCardTx(currentUser, {dir:'in', amount:finalAmount, title:'Щоденний бонус', subtitle:'День '+streak+' серії', icon:'🎁'}, getActiveCardId());
    checkStreakBonus(streak);

    playSound('win');
    const multText = vip.dailyMult > 1 ? ` (${vip.icon} VIP ×${vip.dailyMult})` : '';
    notify(`🎁 Щоденний бонус: +${finalAmount} ₴${multText}`, 'success');
    addToHistory(`Daily Bonus: +${finalAmount}`);
    closeTabModal('daily-bonus-modal');
    document.getElementById('dailyBonusBanner').classList.add('hidden');
}

// ============================================
// TELEGRAM ДЕПОЗИТ
// ============================================
// ============================================
// РЕКВІЗИТИ ДЛЯ ПОПОВНЕННЯ (заміни на свої!)
// ============================================
const DEPOSIT_REQUISITES = {
  mono:       '4874 0700 7092 4301 — Іван Колодєєв',
  telegram:   'Напиши боту @SlotOK_DepositBot свій ID та суму'
};
const DEPOSIT_METHOD_NAMES = {
  // usdt — лише щоб старі заявки в історії мали назву; як спосіб донату прибраний
  mono: 'Monobank', usdt: 'USDT (TRC20)', telegram: 'Telegram'
};
let selectedDepMethod = 'mono';

const BANK_LOADING_STEPS = [
  'Перевірка реквізитів...', 'З’єднання з банком...', 'Підтвердження транзакції...',
  'Шифрування даних...', 'Синхронізація балансу...', 'Перевірка на шахрайство...'
];

// Brief bank-app-style "processing" screen — a different random sequence/
// duration each time so it doesn't feel like a canned delay — then calls onDone.
function showBankProcessing(accent, onDone) {
  document.getElementById('depReceiptModal')?.remove();
  const steps = [...BANK_LOADING_STEPS].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
  const modal = document.createElement('div');
  modal.id = 'depReceiptModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.92 * var(--recess-k)));z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  modal.innerHTML = `
    <style>@keyframes depSpin{to{transform:rotate(360deg)}}</style>
    <div style="background:var(--surface-1);border:1.5px solid ${accent}4d;border-radius:var(--r-xl);padding:36px 20px;max-width:360px;width:100%;text-align:center;animation:popIn .3s ease;">
      <div style="width:48px;height:48px;border-radius:50%;border:3px solid ${accent}33;border-top-color:${accent};margin:0 auto 18px;animation:depSpin .8s linear infinite;"></div>
      <div id="depLoadingText" style="font-size:13px;color:var(--fg-2);min-height:18px;">${steps[0]}</div>
    </div>`;
  document.body.appendChild(modal);
  let i = 0;
  const stepMs = 350 + Math.random() * 300;
  const iv = setInterval(() => {
    i++;
    const el = document.getElementById('depLoadingText');
    if(el && steps[i]) el.textContent = steps[i];
  }, stepMs);
  const totalMs = steps.length * stepMs + 300 + Math.random() * 400;
  setTimeout(() => { clearInterval(iv); onDone(); }, totalMs);
}

// Bank-app-style success receipt shown after a deposit/withdraw request is submitted.
function showBankReceipt({ sign, amount, accent, title, subtitle, rows }) {
  document.getElementById('depReceiptModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'depReceiptModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.92 * var(--recess-k)));z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  const rowsHtml = rows.map(([k, v]) => `<div style="display:flex;justify-content:space-between;"><span>${k}</span><span style="color:var(--fg-2);font-weight:600;">${v}</span></div>`).join('');
  modal.innerHTML = `
    <div style="background:var(--surface-1);border:1.5px solid ${accent}4d;border-radius:var(--r-xl);padding:28px 20px 20px;max-width:360px;width:100%;text-align:center;animation:popIn .3s ease;">
      <div style="width:64px;height:64px;border-radius:50%;background:${accent}1f;border:2px solid ${accent};display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:32px;color:${accent};">✓</div>
      <div style="font-size:16px;font-weight:800;color:var(--fg);margin-bottom:4px;">${title}</div>
      <div style="font-size:12px;color:var(--fg-3);margin-bottom:18px;">${subtitle}</div>
      <div style="font-family:var(--font-display);font-size:30px;font-weight:900;color:${accent};margin-bottom:18px;">${sign}${amount}₴</div>
      <div style="background:var(--bg);border-radius:var(--r-lg);padding:12px 14px;text-align:left;font-size:12px;color:var(--fg-3);display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
        ${rowsHtml}
      </div>
      <button onclick="document.getElementById('depReceiptModal').remove()" style="width:100%;background:${accent}1f;border:1px solid ${accent}4d;border-radius:var(--r-lg);padding:12px;color:${accent};cursor:pointer;font-size:13px;font-weight:700;margin-bottom:16px;">Готово</button>
      <div style="font-size:10px;color:var(--fg-4);line-height:1.5;">🔒 Захищено SSL-шифруванням<br>© ${new Date().getFullYear()} SlotOK. Усі права захищено.</div>
    </div>`;
  document.body.appendChild(modal);
}

function showDepositLoading(amount, method, reqId) {
  showBankProcessing('#3dd68c', () => showDepositReceipt(amount, method, reqId));
}

function showDepositReceipt(amount, method, reqId) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('uk-UA') + ' ' + now.toLocaleTimeString('uk-UA', {hour:'2-digit', minute:'2-digit'});
  showBankReceipt({
    sign: '+', amount, accent: '#3dd68c',
    title: 'Заявку прийнято', subtitle: 'Очікуйте підтвердження адміністратора',
    rows: [
      ['Спосіб', DEPOSIT_METHOD_NAMES[method] || method],
      ['ID транзакції', `<span style="font-family:var(--font-mono);">${reqId.slice(-10)}</span>`],
      ['Дата', dateStr],
      ['Статус', '<span style="color:var(--accent);">Обробка</span>']
    ]
  });
}

function selectDepMethod(method, el) {
  selectedDepMethod = method;
  const scope = (el && el.parentElement) || document.getElementById('depMethodBtns') || document;
  scope.querySelectorAll('.wm-btn').forEach(b => b.classList.remove('selected'));
  if(el) el.classList.add('selected');
  const box = document.getElementById('depRequisitesBox');
  const txt = document.getElementById('depRequisitesText');
  if(box && txt) {
    txt.textContent = DEPOSIT_REQUISITES[method] || '—';
    box.style.display = 'flex';
  }
}

function copyDepRequisites() {
  const req = DEPOSIT_REQUISITES[selectedDepMethod] || '';
  navigator.clipboard?.writeText(req).then(() => notify('📋 Скопійовано!','success'))
    .catch(() => notify(req,'info'));
}

// Fire-and-forget push to the Telegram bot so admin gets an actionable
// notification immediately, without waiting for the player to open the bot.
// Порожній або битий <img> інакше малює системну іконку "зламане зображення":
// аватарки без avatarUrl, прев'ю чату/підтримки до вибору файлу, мертві
// посилання в історії повідомлень. Один перехоплювач на документі замість
// guard-а в кожному з ~20 місць, де будується <img>.
const IMG_FALLBACK = 'data:image/svg+xml;charset=utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
  '<rect width="48" height="48" rx="10" fill="#15151c"/>' +
  '<circle cx="24" cy="19" r="7" fill="#3a3a48"/>' +
  '<path d="M10 42c0-8 6.5-12 14-12s14 4 14 12z" fill="#3a3a48"/></svg>');

document.addEventListener('error', e => {
  const el = e.target;
  if(!el || el.tagName !== 'IMG') return;
  if(el.onerror) return;              // у місця зі своїм onerror не лізем
  if(el.dataset.imgFallback) return;  // і не зациклюємось на самому фолбеку
  el.dataset.imgFallback = '1';
  el.src = IMG_FALLBACK;
}, true);

// Заголовок з Firebase ID token, якщо гравець увійшов через сервер (api/auth).
// Сервер за ним знає, ХТО надсилає — без цього будь-хто міг слати чужим
// гравцям у Telegram фейкові «виграш +N₴».
async function authHeaders() {
  try {
    const u = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    return u ? { Authorization: 'Bearer ' + await u.getIdToken() } : {};
  } catch(e) { return {}; }
}
// Повідомлення гравця в загальний чат разом з міткою часу chat_rate/<нік>.
// У строгих правилах база пропускає повідомлення, лише якщо попереднє було
// щонайменше 2 с тому — антиспам, який не обійти з консолі браузера.
function postChatMessage(node, msg) {
  const key = db.ref(node).push().key;
  return db.ref().update({
    [node + '/' + key]: msg,
    ['chat_rate/' + currentUser]: firebase.database.ServerValue.TIMESTAMP,
  }).catch(e => {
    if(!/permission/i.test(String(e && (e.code || e.message)))) return console.warn(e);
    // Опубліковані правила ще не знають chat_rate — пишемо як раніше. У строгих
    // правилах такий запис без мітки часу не пройде, тож антиспам не обійти.
    return db.ref(node + '/' + key).set(msg)
      .catch(() => notify('⏳ Не так швидко — зачекай пару секунд', 'error'));
  });
}

async function notifyBot(type, id, extra) {
  try {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, type === 'player-ping' ? await authHeaders() : {});
    fetch('/api/notify', {
      method: 'POST',
      headers,
      body: JSON.stringify(Object.assign({ type, id }, extra)),
    }).catch(() => {});
  } catch(e) { console.warn(e); }
}

function submitDepositRequest() {
  const customInput = document.getElementById('customDepAmount');
  let amount = selectedDepAmount;
  if(amount === 0 && customInput && customInput.value) amount = parseInt(customInput.value);
  if(!amount || amount < 50) {
    notify('Оберіть суму поповнення (мін. 50₴)', 'error');
    return;
  }
  const userId = userData.id || currentUser;
  const userName = currentUser;
  const reqId = `${userName}_${Date.now()}`;
  const btn = document.getElementById('depSubmitBtn');
  if(btn) { btn.disabled = true; btn.textContent = 'Відправляємо…'; }

  db.ref('deposit_requests/' + reqId).set({
    user: userName,
    userId: userId,
    amount: amount,
    method: selectedDepMethod || 'mono',
    // Прив'язка до картки, активної на момент заявки: адмін зарахує саме на неї,
    // навіть якщо гравець згодом перемкне активну картку.
    cardId: getActiveCardId() || null,
    status: 'pending',
    time: Date.now()
  }).then(() => {
    notifyBot('deposit', reqId);
    // Notify admin via PM
    db.ref('pm/theivankoo/' + db.ref().push().key).set({
      from: '📥 Система', to: 'theivankoo',
      text: `💰 Нова заявка на депозит від @${userName}: ${amount}₴ (${selectedDepMethod || 'mono'})`,
      ts: Date.now()
    });
    db.ref('users/theivankoo/pmUnread').set(firebase.database.ServerValue.increment(1));
    // Also try to notify any other admin
    db.ref('users').orderByChild('isAdmin').equalTo(true).limitToFirst(5).once('value', snap => {
      const admins = snap.val() || {};
      Object.keys(admins).forEach(admNick => {
        if(admNick === 'theivankoo') return;
        db.ref('pm/' + admNick + '/' + db.ref().push().key).set({
          from: '📥 Система', to: admNick,
          text: `💰 Нова заявка на депозит від @${userName}: ${amount}₴`,
          ts: Date.now()
        });
        db.ref('users/' + admNick + '/pmUnread').set(firebase.database.ServerValue.increment(1));
      });
    });
    showDepositLoading(amount, selectedDepMethod || 'mono', reqId);
    if(btn) { btn.disabled = false; btn.textContent = 'Задонатити'; }
    selectedDepAmount = 0;
    ksClearDepositAmountUI();
    if(customInput) customInput.value = '';
    document.getElementById('customAmountBox')?.classList.add('hidden');
    loadMyDeposits();
  }).catch(err => {
    notify('Помилка подачі заявки. Спробуй ще.', 'error');
    if(btn) { btn.disabled = false; btn.textContent = 'Задонатити'; }
  });
}

function openTelegramBot() {
  const customInput = document.getElementById('customDepAmount');
  let amount = selectedDepAmount;
  if(amount === 0 && customInput && customInput.value) amount = parseInt(customInput.value);
  if(!amount || amount < 50) {
    notify('Оберіть суму поповнення (мін. 50₴)', 'error');
    return;
  }
  const userId = userData.id || currentUser;
  const startParam = `dep_${userId}_${amount}`;
  const tgUrl = `https://t.me/${TG_BOT_USERNAME}?start=${startParam}`;
  window.open(tgUrl, '_blank');
  notify(`✈️ Telegram бот відкривається. ID: ${userId}`, 'info');
}

function linkTelegram() {
  const token = String(Math.floor(100000 + Math.random() * 900000));
  db.ref('telegram_link_tokens/' + token).set({ nick: currentUser, createdAt: Date.now() });
  document.getElementById('tgLinkCode').textContent = token;
  document.getElementById('tgLinkOpenBtn').onclick = () => {
    window.open(`https://t.me/${TG_BOT_USERNAME}?start=link_${token}`, '_blank');
  };
  document.getElementById('tgLinkModal').classList.remove('hidden');
}

function unlinkTelegram() {
  db.ref('users/' + currentUser + '/telegramChatId').once('value', snap => {
    const chatId = snap.val();
    db.ref('users/' + currentUser + '/telegramChatId').remove();
    if (chatId) db.ref('telegram_links/' + chatId).remove();
    notify('Telegram відв\'язано', 'info');
  });
}

function initTelegramLinkStatus() {
  // Без перевірки db тут кидався TypeError, коли Firebase не піднявся, — а ця
  // функція викликається в шляху успішного входу ДО startDataSync(), тож
  // виняток залишав користувача з «увійшов», але без жодної синхронізації даних.
  if (!currentUser || !db) return;
  const tgStatusRef = db.ref('users/' + currentUser + '/telegramChatId');
  tgStatusRef.off('value'); // avoid stacking duplicate listeners if called more than once per session
  tgStatusRef.on('value', snap => {
    const statusEl = document.getElementById('tgLinkStatus');
    const btnEl = document.getElementById('tgLinkBtn');
    if (!statusEl || !btnEl) return;
    if (snap.val()) {
      statusEl.textContent = 'Прив\'язано ✅';
      btnEl.textContent = 'Відв\'язати';
      btnEl.onclick = unlinkTelegram;
    } else {
      statusEl.textContent = 'Не прив\'язано';
      btnEl.textContent = 'Прив\'язати';
      btnEl.onclick = linkTelegram;
    }
  });
}

function loadMyDeposits() {
  const list = document.getElementById('myDepositsList');
  if(!list || !currentUser) return;
  db.ref('deposit_requests').orderByChild('user').equalTo(currentUser).limitToLast(5).once('value', snap => {
    const data = snap.val();
    if(!data) { list.innerHTML = '<div class="ks-muted">Активних заявок немає</div>'; return; }
    const entries = Object.entries(data).sort((a,b) => (b[1].time||0)-(a[1].time||0));
    list.innerHTML = entries.map(([id, d]) => {
      const date = new Date(d.time).toLocaleString('uk-UA', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
      const done = d.status === 'done', bad = d.status === 'rejected';
      const cls  = done ? 'pw-done' : bad ? 'pw-rejected' : 'pw-pending';
      const text = done ? 'Зараховано' : bad ? 'Відхилено' : 'Очікує';
      const icon = done ? 'check' : bad ? 'x' : 'clock';
      return `<div class="pending-withdraw">
        <div class="ks-icn ${done ? 'is-pos' : bad ? 'is-neg' : ''}">${ksIcon(icon)}</div>
        <div class="ks-row-main">
          <div class="ks-row-title ks-num">+${formatNumber(d.amount)} ₴</div>
          <div class="ks-row-sub">${DEPOSIT_METHOD_NAMES[d.method] || d.method || '—'} · ${date}</div>
        </div>
        <span class="pw-status ${cls}">${text}</span>
      </div>`;
    }).join('');
  });
}

function ksClearDepositAmountUI() {
    document.querySelectorAll('#cashier-panel-deposit .amount-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('#depositPackages .dep-package').forEach(p => p.classList.remove('is-selected'));
}

function selectDepAmount(amount, el) {
    selectedDepAmount = amount;
    ksClearDepositAmountUI();
    if(el) el.classList.add('selected');
    document.getElementById('customAmountBox')?.classList.add('hidden');
    localStorage.removeItem('pendingDepBonus');
}

function selectCustomAmount() {
    ksClearDepositAmountUI();
    document.getElementById('customAmtBtn')?.classList.add('selected');
    document.getElementById('customAmountBox')?.classList.remove('hidden');
    document.getElementById('customDepAmount')?.focus();
    selectedDepAmount = 0;
    localStorage.removeItem('pendingDepBonus');
}

// ============================================
// ВИВІД КОШТІВ
// ============================================
function submitWithdraw() {
    const card = document.getElementById('withdrawCard').value.trim();
    const amount = parseInt(document.getElementById('withdrawAmount').value);

    if(!card) return notify("Введіть реквізити для виводу", "error");
    if(!amount || amount < 200) return notify("Мінімальна сума виводу: 200₴", "error");
    if(userData.balance < amount) return notify("Недостатньо коштів", "error");
    if(userData.autoFrozen) return notify("🚩 Акаунт тимчасово призупинено (підозріла активність) — звернись у підтримку", "error");
    if(isActiveCardFrozen()) return notify("🔒 Активна картка заблокована — розблокуй її в Гаманці", "error");
    if(!checkCardLimit(getActiveCardId(), amount)) return;

    // Перевірка на pending заявки
    if(userData.pendingWithdraw) {
        return notify("У вас вже є активна заявка на вивід. Дочекайтесь її обробки.", "error");
    }

    // Великі суми — реальне 2FA: підтвердження тапом у Telegram гравця
    // (webhook перевіряє, що це саме його chatId), а не код, видимий у
    // тому ж вікні браузера, звідки подано заявку.
    const needs2FA = amount >= WITHDRAW_2FA_THRESHOLD;
    if(needs2FA && !userData.telegramChatId) {
        notify('🔐 Для виводу від '+formatNumber(WITHDRAW_2FA_THRESHOLD)+'₴ потрібно прив’язати Telegram (Профіль → Сповіщення) — звідти прийде підтвердження.', 'error');
        return;
    }

    const requestId = `${currentUser}_${Date.now()}`;
    const status = needs2FA ? 'pending_2fa' : 'pending';

    // Заморозити гроші
    db.ref('users/' + currentUser).update({
        balance: firebase.database.ServerValue.increment(-amount),
        pendingWithdraw: true
    });

    // Зберегти заявку
    db.ref('withdraw_requests/' + requestId).set({
        user: currentUser,
        userId: userData.id,
        amount: amount,
        method: selectedWithdrawMethod,
        card: card,
        // Картка, з якої кошти заморозили: на неї ж повернемо при відмові й
        // її ж історію позначимо при схваленні, навіть якщо гравець тим часом
        // перемкнув активну.
        cardId: getActiveCardId() || null,
        status: status,
        time: Date.now()
    }).then(() => notifyBot(needs2FA ? 'withdraw-2fa' : 'withdraw', requestId));

    db.ref('users/' + currentUser + '/withdraws/' + requestId).set({
        amount: amount,
        method: selectedWithdrawMethod,
        status: status,
        time: Date.now()
    });

    noteCardSpend(getActiveCardId(), amount);
    addToHistory(needs2FA ? `Заявка на вивід: -${amount} ₴ (очікує підтвердження в Telegram)` : `Заявка на вивід: -${amount} ₴ (обробляється)`);
    // Адміна повідомляємо одразу лише для заявок БЕЗ 2FA — підтверджені 2FA-заявки
    // сам webhook сповістить адміна, щойно гравець тапне "Підтвердити" в Telegram.
    if(!needs2FA) {
        db.ref('pm/theivankoo/'+db.ref().push().key).set({from:'📤 Система', to:'theivankoo', text:`💸 Нова заявка на вивід від @${currentUser}: ${amount}₴ (${selectedWithdrawMethod})`, ts:Date.now()});
        db.ref('users/theivankoo/pmUnread').set(firebase.database.ServerValue.increment(1));
    }

    if(needs2FA) {
        showWithdraw2FAWait(amount, requestId);
    } else {
        showWithdrawLoading(amount, selectedWithdrawMethod, card, requestId);
    }

    document.getElementById('withdrawCard').value = '';
    document.getElementById('withdrawAmount').value = '';
    loadMyWithdraws();
}

const WITHDRAW_METHOD_NAMES = { privat: 'PrivatBank', mono: 'Monobank', card: 'Visa/Mastercard', usdt: 'USDT (TRC20)' };

function maskDest(dest) {
  if(dest.length <= 8) return dest;
  return dest.slice(0, 4) + '••••' + dest.slice(-4);
}

function showWithdrawLoading(amount, method, dest, reqId) {
  showBankProcessing('#e74c3c', () => showWithdrawReceipt(amount, method, dest, reqId));
}

function showWithdrawReceipt(amount, method, dest, reqId) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('uk-UA') + ' ' + now.toLocaleTimeString('uk-UA', {hour:'2-digit', minute:'2-digit'});
  showBankReceipt({
    sign: '-', amount, accent: '#e74c3c',
    title: 'Заявку на вивід прийнято', subtitle: 'Кошти надійдуть протягом 1-24 год',
    rows: [
      ['Спосіб', WITHDRAW_METHOD_NAMES[method] || method],
      ['Отримувач', `<span style="font-family:var(--font-mono);">${maskDest(dest)}</span>`],
      ['ID транзакції', `<span style="font-family:var(--font-mono);">${reqId.slice(-10)}</span>`],
      ['Дата', dateStr],
      ['Статус', '<span style="color:var(--accent);">Обробка</span>']
    ]
  });
}

function loadMyWithdraws() {
    const list = document.getElementById('myWithdrawsList');
    if(!list) return;
    
    db.ref('users/' + currentUser + '/withdraws').limitToLast(5).once('value', snap => {
        const data = snap.val();
        if(!data) { list.innerHTML = '<div class="ks-muted">Заявок немає</div>'; return; }

        list.innerHTML = Object.entries(data).reverse().map(([id, w]) => {
            const date = new Date(w.time).toLocaleString('uk-UA', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
            const done = w.status === 'done';
            const isBad = w.status === 'rejected' || w.status === 'cancelled';
            const cls = done ? 'pw-done' : isBad ? 'pw-rejected' : 'pw-pending';
            const text = done ? 'Виконано' : w.status === 'rejected' ? 'Відхилено'
              : w.status === 'cancelled' ? 'Скасовано' : w.status === 'pending_2fa' ? 'Підтвердіть у Telegram' : 'Обробляється';
            const icon = done ? 'check' : isBad ? 'x' : w.status === 'pending_2fa' ? 'shield' : 'clock';
            return `
                <div class="pending-withdraw">
                    <div class="ks-icn ${done ? 'is-pos' : isBad ? 'is-neg' : ''}">${ksIcon(icon)}</div>
                    <div class="ks-row-main">
                        <div class="ks-row-title ks-num">−${formatNumber(w.amount)} ₴</div>
                        <div class="ks-row-sub">${DEPOSIT_METHOD_NAMES[w.method] || w.method || '—'} · ${date}</div>
                    </div>
                    <span class="pw-status ${cls}">${text}</span>
                </div>
            `;
        }).join('');
    });
}

