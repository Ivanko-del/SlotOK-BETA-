// ============================================================
// ВІДНОВЛЕННЯ ПАРОЛЯ
// ============================================================
const SECURITY_QUESTIONS = {
  first_phone:    "Модель вашого першого телефона?",
  first_teacher:  "Ім'я та по батькові першої вчительки?",
  first_job:      "Де ви вперше заробили гроші?",
  childhood_nick: "Ваше дитяче прізвисько?",
  first_concert:  "Перший концерт або матч, на який ви ходили?",
  dream_job:      "Ким ви мріяли стати в дитинстві?",
  // Старі питання — більше не пропонуються (відповіді легко знайти в
  // соцмережах), але лишаються, щоб старі акаунти бачили своє питання.
  pet:    "Кличка вашого першого улюбленця?",
  city:   "Місто, де ви народились?",
  school: "Назва вашої школи?",
  friend: "Ім'я найкращого друга дитинства?",
  book:   "Улюблена книга/фільм?"
};
// Ключ зі списку або власний текст гравця (тоді показуємо сам текст).
function securityQuestionText(q) {
  return SECURITY_QUESTIONS[q] || (typeof q === 'string' && q.trim() ? q : 'Контрольне питання');
}
// prefix 'reg' (реєстрація) або 'sq' (модалка в налаштуваннях)
function secQuestionChanged(prefix) {
  const sel = document.getElementById(prefix + 'SecQuestion');
  const box = document.getElementById(prefix + 'SecCustomBox');
  if(sel && box) box.style.display = sel.value === 'custom' ? '' : 'none';
}
function readSecQuestion(prefix) {
  const sel = document.getElementById(prefix + 'SecQuestion')?.value || '';
  if(sel !== 'custom') return sel;
  return (document.getElementById(prefix + 'SecCustom')?.value || '').trim().replace(/[<>"'`]/g, '');
}

function openPasswordRecovery() {
  const existing = document.getElementById('pwrModal');
  if(existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'pwrModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.92 * var(--recess-k)));z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  modal.innerHTML = `
    <div style="max-width:380px;width:100%;background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r-lg);padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-family:var(--font-display);font-size:15px;color:var(--accent);">🔑 Відновлення пароля</div>
        <button onclick="document.getElementById('pwrModal').remove()" style="background:none;border:1px solid var(--line);border-radius:var(--r-md);color:var(--fg-3);padding:4px 10px;cursor:pointer;">✕</button>
      </div>
      <div id="pwrBody"></div>
    </div>`;
  document.body.appendChild(modal);
  pwrShowStep1();
}

function pwrShowStep1() {
  const body = document.getElementById('pwrBody');
  if(!body) return;
  body.innerHTML = `
    <div style="font-size:12px;color:var(--fg-3);margin-bottom:10px;">Введіть свій нікнейм, щоб почати відновлення.</div>
    <input class="auth-input" id="pwrNick" placeholder="Нікнейм" style="margin-bottom:10px;">
    <div id="pwrErr" style="color:var(--neg);font-size:12px;margin-bottom:8px;display:none;"></div>
    <button class="auth-btn-main" onclick="pwrLookup()">Далі →</button>`;
}

function pwrErr(msg) {
  const el = document.getElementById('pwrErr');
  if(el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function pwrLookup() {
  const nick = (document.getElementById('pwrNick')?.value || '').trim();
  if(!nick) return pwrErr('Введіть нікнейм');
  db.ref('users/' + nick).once('value', snap => {
    if(!snap.exists()) return pwrErr('Гравця не знайдено');
    const data = snap.val();
    // Хеш відповіді сервер переносить у закритий user_secrets, тож тут його
    // вже може не бути — орієнтуємось на саме питання. Якщо відповіді насправді
    // немає, сервер скаже not_found і ми перейдемо на Telegram.
    if(data.securityQuestion && (data.securityAnswerHash || data.hasSecurityAnswer || !data.pass)) {
      pwrShowQuestion(nick, data.securityQuestion);
    } else {
      pwrShowTelegramFallback(nick);
    }
  }, () => pwrErr('Помилка звʼязку з базою'));
}

function pwrShowQuestion(nick, qKey) {
  const body = document.getElementById('pwrBody');
  if(!body) return;
  const qText = securityQuestionText(qKey);
  body.innerHTML = `
    <div style="font-size:12px;color:var(--fg-3);margin-bottom:10px;">${escapeHtml(qText)}</div>
    <input class="auth-input" id="pwrAnswer" placeholder="Відповідь" style="margin-bottom:10px;">
    <input class="auth-input" id="pwrNewPass" type="password" placeholder="Новий пароль (мін 6 символів)" style="margin-bottom:10px;">
    <input class="auth-input" id="pwrNewPass2" type="password" placeholder="Повторіть новий пароль" style="margin-bottom:10px;">
    <div id="pwrErr" style="color:var(--neg);font-size:12px;margin-bottom:8px;display:none;"></div>
    <button class="auth-btn-main" onclick="pwrVerifyAndReset(${jsArg(nick)})">Змінити пароль</button>
    <div style="text-align:center;margin-top:10px;">
      <span onclick="pwrShowTelegramFallback(${jsArg(nick)})" style="color:var(--fg-3);font-size:11px;cursor:pointer;text-decoration:underline;">Не пам'ятаю відповідь</span>
    </div>`;
}

async function pwrVerifyAndReset(nick) {
  const answer = (document.getElementById('pwrAnswer')?.value || '').trim();
  const p1 = document.getElementById('pwrNewPass')?.value || '';
  const p2 = document.getElementById('pwrNewPass2')?.value || '';
  if(!answer) return pwrErr('Введіть відповідь');
  if(p1.length < 6) return pwrErr('Пароль мінімум 6 символів');
  if(p1 !== p2) return pwrErr('Паролі не збігаються');

  const pwrDone = () => {
    document.getElementById('pwrModal')?.remove();
    notify('✅ Пароль змінено! Тепер увійдіть з новим паролем.', 'success');
    const loginName = document.getElementById('loginName');
    if(loginName) loginName.value = nick;
  };
  // Сервер перевіряє відповідь з лімітом спроб — офлайн-перебір хешу відповіді
  // з публічної бази більше не допомагає.
  const srv = await serverAuthCall('reset', { nick, answer, newPassword: p1 });
  if(srv.status === 200) return pwrDone();
  if(srv.status === 404 && srv.data.error === 'not_found') return pwrShowTelegramFallback(nick);
  if(serverAuthIsFinal(srv)) return pwrErr(srv.data.message);
  if(await serverAuthEnabled()) return pwrErr('Сервер недоступний. Спробуй за хвилину.');

  db.ref('users/' + nick + '/securityAnswerHash').once('value', async snap => {
    let check, newPassHash;
    try {
      // verify() сама розбереться, у якому форматі лежить стара відповідь —
      // у частини акаунтів це ще голий SHA-256 з попередньої схеми.
      check = await SlotOKPassword.verify(answer.toLowerCase(), snap.val());
      if(!check.ok) return pwrErr('Невірна відповідь');
      newPassHash = await SlotOKPassword.hash(p1);
    } catch(e) {
      console.error('Password reset error:', e);
      return pwrErr(e.message || 'Не вдалося перевірити відповідь');
    }
    const updates = { ['users/' + nick + '/pass']: newPassHash };
    if(check.needsUpgrade) updates['users/' + nick + '/securityAnswerHash'] = await SlotOKPassword.hash(answer.toLowerCase());
    db.ref().update(updates).then(() => {
      document.getElementById('pwrModal')?.remove();
      notify('✅ Пароль змінено! Тепер увійдіть з новим паролем.', 'success');
      const loginName = document.getElementById('loginName');
      if(loginName) loginName.value = nick;
    }).catch(() => pwrErr('Помилка запису. Спробуйте ще.'));
  }, () => pwrErr('Помилка звʼязку з базою'));
}

function pwrShowTelegramFallback(nick) {
  const body = document.getElementById('pwrBody');
  if(!body) return;
  body.innerHTML = `
    <div style="font-size:12px;color:var(--fg-3);margin-bottom:12px;line-height:1.5;">
      Автоматичне відновлення недоступне для цього акаунту. Подайте заявку — адміністратор перевірить вас у Telegram і скине пароль вручну.
    </div>
    <div id="pwrErr" style="color:var(--neg);font-size:12px;margin-bottom:8px;display:none;"></div>
    <div id="pwrTgStatus" style="color:var(--pos);font-size:12px;margin-bottom:8px;display:none;"></div>
    <button class="auth-btn-main" id="pwrTgBtn" onclick="pwrRequestViaTelegram(${jsArg(nick)})">✈️ Подати заявку через Telegram</button>`;
}

function pwrRequestViaTelegram(nick) {
  const btn = document.getElementById('pwrTgBtn');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Надсилаємо...'; }
  const reqId = nick + '_' + Date.now();
  db.ref('password_reset_requests/' + reqId).set({
    user: nick, status: 'pending', time: Date.now()
  }).then(() => {
    notifyBot('reset', reqId);
    db.ref('pm/theivankoo/' + db.ref().push().key).set({
      from: '📥 Система', to: 'theivankoo',
      text: `🔑 Заявка на відновлення пароля від @${nick}. Перевірте особу через Telegram і скиньте пароль в адмін-панелі.`,
      ts: Date.now()
    });
    db.ref('users/theivankoo/pmUnread').set(firebase.database.ServerValue.increment(1));
    db.ref('users').orderByChild('isAdmin').equalTo(true).limitToFirst(5).once('value', snap => {
      const admins = snap.val() || {};
      Object.keys(admins).forEach(admNick => {
        if(admNick === 'theivankoo') return;
        db.ref('pm/' + admNick + '/' + db.ref().push().key).set({
          from: '📥 Система', to: admNick,
          text: `🔑 Заявка на відновлення пароля від @${nick}`,
          ts: Date.now()
        });
        db.ref('users/' + admNick + '/pmUnread').set(firebase.database.ServerValue.increment(1));
      });
    });
    const tgUrl = `https://t.me/${TG_BOT_USERNAME}?start=reset_${nick}`;
    window.open(tgUrl, '_blank');
    const status = document.getElementById('pwrTgStatus');
    if(status) { status.textContent = '✅ Заявку надіслано. Напишіть боту в Telegram для підтвердження — адмін скине пароль і надішле його вам у приватні повідомлення.'; status.style.display = 'block'; }
    if(btn) { btn.textContent = '✅ Заявку подано'; }
  }).catch(() => {
    pwrErr('Не вдалось подати заявку. Спробуйте ще.');
    if(btn) { btn.disabled = false; btn.textContent = '✈️ Подати заявку через Telegram'; }
  });
}


function switchAuthTab(mode) {
  const isLogin = mode === 'login';
  const loginForm = document.getElementById('loginForm');
  const regForm   = document.getElementById('regForm');
  const tabLogin  = document.getElementById('authTabLogin');
  const tabReg    = document.getElementById('authTabReg');
  const tabsWrap  = document.getElementById('authTabs');
  const errEl     = document.getElementById('authError');
  if(loginForm) loginForm.classList.toggle('hidden', !isLogin);
  if(regForm)   regForm.classList.toggle('hidden', isLogin);
  if(tabLogin)  { tabLogin.classList.toggle('active', isLogin); tabLogin.setAttribute('aria-selected', isLogin); }
  if(tabReg)    { tabReg.classList.toggle('active', !isLogin); tabReg.setAttribute('aria-selected', !isLogin); }
  if(tabsWrap)  tabsWrap.classList.toggle('reg-active', !isLogin);
  if(errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if(!isLogin) regStep(1);
}

// Реєстрація у 2 кроки: 1) нік і пароль, 2) захист акаунту (+email/промокод).
function regStep1Error(n, p) {
  if(!n)             return 'Введіть нікнейм';
  if(n.length < 3)   return 'Нікнейм мінімум 3 символи';
  if(n.length > 20)  return 'Нікнейм максимум 20 символів';
  if(n.includes(' ')) return 'Нікнейм не може містити пробіли';
  if(!/^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9_\-]+$/.test(n)) return 'Нікнейм може містити лише літери, цифри, "_" та "-"';
  if(!p)             return 'Введіть пароль';
  if(p.length < 6)   return 'Пароль мінімум 6 символів';
  return '';
}
function regStep(n) {
  const form = document.getElementById('regForm');
  if(!form) return;
  form.dataset.step = String(n);
  document.getElementById('regStep1')?.classList.toggle('hidden', n !== 1);
  document.getElementById('regStep2')?.classList.toggle('hidden', n !== 2);
  form.querySelectorAll('.auth-step').forEach((el, i) => el.classList.toggle('is-on', i < n));
  const focus = document.getElementById(n === 1 ? 'regName' : (document.getElementById('regSecQuestion')?.value === 'custom' ? 'regSecCustom' : 'regSecAnswer'));
  if(focus && document.getElementById('auth-screen')?.offsetParent !== null) setTimeout(() => focus.focus({ preventScroll: true }), 30);
}
async function regSubmit() {
  const form = document.getElementById('regForm');
  if(!form) return;
  if(form.dataset.step === '2') return authRegister();
  const n = (document.getElementById('regName')?.value || '').trim();
  const p = document.getElementById('regPass')?.value || '';
  const err = regStep1Error(n, p);
  if(err) return showAuthError(err);
  // Зайнятий нік кажемо одразу, а не після заповнення другого кроку.
  // Не вдалося перевірити — не страшно: сервер однаково перевірить.
  const btn = document.getElementById('regNextBtn');
  if(btn) btn.disabled = true;
  try {
    const r = await fetch(authShallowUrl('users/' + encodeURIComponent(n)));
    if(r.ok && (await r.json()) !== null) return showAuthError('❌ Нікнейм "' + n + '" вже зайнятий');
  } catch(e) {} finally { if(btn) btn.disabled = false; }
  const errEl = document.getElementById('authError');
  if(errEl) errEl.style.display = 'none';
  regStep(2);
}

// 👁 Показати/приховати пароль на екрані входу й реєстрації
function toggleAuthPassVisibility(inputId, btnEl) {
  const inp = document.getElementById(inputId);
  if(!inp) return;
  const shown = inp.type === 'text';
  inp.type = shown ? 'password' : 'text';
  if(btnEl) {
    btnEl.setAttribute('aria-label', shown ? 'Показати пароль' : 'Сховати пароль');
    btnEl.classList.toggle('is-on', !shown);
  }
}

function setPlayerStatus(status) {
  if(!currentUser) return;
  db.ref('users/'+currentUser+'/status').set(status);
  userData.status = status;
  notify('Статус оновлено: '+status,'info');
}
function logout(){
  stopBgMusic();
  localStorage.removeItem(SESSION_KEY);
  const done = () => location.reload();
  try {
    if(typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      firebase.auth().signOut().then(done, done);
      return;
    }
  } catch(e) { console.warn(e); }
  done();
}

