// ============================================
// РЕЙТИНГ
// ============================================
// renderTop() — прибрано, дублювало неробочий недосяжний екран tab-top

// ============================================================
// АВТОРИЗАЦІЯ — надійна версія (callback style)
// ============================================================
function showAuthError(msg) {
  const el = document.getElementById('authError');
  if(!el) return;
  el.textContent = msg;
  el.style.display = 'flex';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 6000);
}

async function authLogin() {
  const n = (document.getElementById('loginName')?.value || '').trim();
  const p = (document.getElementById('loginPass')?.value || '');
  if(!n) return showAuthError('Введіть нікнейм');
  if(!p) return showAuthError('Введіть пароль');
  if(!db) return showAuthError('Немає зʼєднання з Firebase. Перевір інтернет.');

  const btn = document.getElementById('loginBtn');
  if(btn) { btn.textContent = 'Перевіряємо…'; btn.disabled = true; }
  const reset = () => { if(btn) { btn.textContent = 'Увійти'; btn.disabled = false; } };

  const finishLogin = lastSeen => {
    if(btn) btn.textContent = 'Входимо…';
    currentUser = n;
    localStorage.setItem(SESSION_KEY, n);
    initTelegramLinkStatus();
    _capturedLastSeen = lastSeen || null; // для "Ми скучили" — ловимо ДО перезапису
    db.ref('users/' + n).update({ lastSeen: Date.now() });
    setTimeout(() => { try { startDataSync(); } catch(e) { console.error('startDataSync:', e); } }, 100);
  };

  // Спершу — серверна перевірка пароля (ліміт спроб, хеш не їде в браузер).
  const srv = await serverAuthCall('login', { nick: n, password: p });
  if(srv.status === 200 && srv.data.token) {
    try {
      await serverSignIn(srv.data.token);
      const ls = await db.ref('users/' + n + '/lastSeen').once('value');
      return finishLogin(ls.val());
    } catch(e) {
      reset();
      console.error('Server sign-in error:', e);
      return showAuthError('❌ ' + friendlySignInError(e));
    }
  }
  if(serverAuthIsFinal(srv)) { reset(); return showAuthError('❌ ' + srv.data.message); }
  if(await serverAuthEnabled()) {
    // Серверний вхід увімкнено, але зараз він не відповідає — старий шлях у
    // браузері тут не допоможе: правила бази однаково вимагають Auth-сесію.
    reset();
    return showAuthError('⚠️ Сервер входу недоступний. Спробуй за хвилину.');
  }

  const timeout = setTimeout(() => { reset(); showAuthError('⏱ Час вийшов. Перевір інтернет.'); }, 10000);

  db.ref('users/' + n).once('value', async snap => {
    clearTimeout(timeout);
    if(!snap.exists()) { reset(); return showAuthError('❌ Гравця "' + n + '" не знайдено'); }
    const data = snap.val();
    if(data.banned) { reset(); return showAuthError('🚫 Акаунт заблоковано' + (data.banReason ? ': ' + data.banReason : '')); }

    let check;
    try {
      check = await SlotOKPassword.verify(p, data.pass);
    } catch(e) {
      // Інакше кнопка назавжди лишиться в стані «Перевірка...»
      reset();
      console.error('Password verify error:', e);
      return showAuthError('❌ ' + (e.message || 'Не вдалося перевірити пароль'));
    }
    if(!check.ok) { reset(); return showAuthError('❌ Невірний пароль'); }
    if(check.needsUpgrade) {
      // Пароль вірний, але лежить у застарілому вигляді (голий SHA-256 або
      // взагалі відкритий текст) — мовчки переїжджаємо на PBKDF2 із сіллю.
      // Це єдиний момент, коли ми взагалі бачимо пароль у відкритому вигляді.
      try { await db.ref('users/' + n + '/pass').set(await SlotOKPassword.hash(p)); } catch(e) { console.warn(e); }
    }
    const isAdminAcc = n.toLowerCase() === 'theivankoo' || data.isAdmin === true;
    db.ref('site_config/maintenance').once('value', mSnap => {
      if(mSnap.val() && !isAdminAcc) {
        reset();
        return showAuthError('🚧 Сайт тимчасово на технічному обслуговуванні. Спробуй пізніше.');
      }
      finishLogin(data.lastSeen);
    });
  }, err => {
    clearTimeout(timeout);
    reset();
    console.error('Login error:', err);
    showAuthError('❌ Помилка Firebase: ' + (err.message || err.code || 'невідома'));
  });
}

async function authRegister() {
  const email    = (document.getElementById('regEmail')?.value || '').trim();
  const n        = (document.getElementById('regName')?.value  || '').trim();
  const p        = (document.getElementById('regPass')?.value  || '');
  const promo    = (document.getElementById('regPromo')?.value || '').trim().toUpperCase();
  const secQ     = readSecQuestion('reg');
  const secA     = (document.getElementById('regSecAnswer')?.value || '').trim();

  // Validation
  const step1Err = regStep1Error(n, p);
  if(step1Err) { regStep(1); return showAuthError(step1Err); }
  if(secQ.length < 3) return showAuthError('Напиши своє контрольне питання (мінімум 3 символи) або обери зі списку');
  if(secA.length < 3) return showAuthError('Відповідь на контрольне питання — мінімум 3 символи (потрібна для відновлення пароля)');
  if(!db)            return showAuthError('Немає зʼєднання з Firebase. Перевір інтернет.');

  const btn = document.getElementById('regBtn');
  if(btn) { btn.textContent = 'Створюємо акаунт…'; btn.disabled = true; }
  const reset = () => { if(btn) { btn.textContent = 'Створити акаунт'; btn.disabled = false; } };

  // Серверна реєстрація: акаунт і стартовий бонус створює сервер, а не браузер.
  const refByLs = localStorage.getItem('ref_by');
  const srv = await serverAuthCall('register', {
    nick: n, password: p, email, promo, secQ, secA, ref: refByLs && refByLs !== n ? refByLs : undefined,
  });
  if(srv.status === 200 && srv.data.token) {
    try { await serverSignIn(srv.data.token); }
    catch(e) { reset(); console.error('Server sign-in error:', e); return showAuthError('✅ Акаунт створено, але ' + friendlySignInError(e).toLowerCase()); }
    if(btn) btn.textContent = 'Входимо…';
    currentUser = n;
    localStorage.setItem(SESSION_KEY, n);
    localStorage.removeItem('ref_by');
    initTelegramLinkStatus();
    const bonusMsg = promo === 'SLOTOK' ? ' +500₴ промокод!' : promo === 'VIP' ? ' +2000₴ VIP!' : '';
    notify('🎉 Вітаємо! Бонус: ' + srv.data.bonus + '₴ + ' + srv.data.spins + ' фріспінів!' + bonusMsg, 'success');
    setTimeout(() => { try { startDataSync(); } catch(e) { console.error('startDataSync err:', e); } }, 200);
    return;
  }
  if(serverAuthIsFinal(srv)) { reset(); return showAuthError('❌ ' + srv.data.message); }
  if(await serverAuthEnabled()) { reset(); return showAuthError('⚠️ Сервер реєстрації недоступний. Спробуй за хвилину.'); }

  const timeout = setTimeout(() => { reset(); showAuthError('⏱ Час вийшов. Перевір інтернет.'); }, 12000);

  let secAnswerHash, passHash;
  try {
    secAnswerHash = await SlotOKPassword.hash(secA.toLowerCase());
    passHash = await SlotOKPassword.hash(p);
  } catch(e) {
    clearTimeout(timeout);
    reset();
    console.error('Password hash error:', e);
    return showAuthError('❌ ' + (e.message || 'Не вдалося захешувати пароль'));
  }

  // Step 1: check if nick is taken
  db.ref('users/' + n).once('value', snap => {
    if(snap.exists()) {
      clearTimeout(timeout);
      reset();
      return showAuthError('❌ Нікнейм "' + n + '" вже зайнятий');
    }

    // Step 2: build new user object
    let bonus = 1000, spins = 10, bonusMsg = '';
    if(promo === 'SLOTOK') { bonus += 500; spins += 5; bonusMsg = ' +500₴ промокод!'; }
    else if(promo === 'VIP') { bonus += 2000; bonusMsg = ' +2000₴ VIP!'; }

    const newUser = {
      pass: passHash, email: email || '',
      securityQuestion: secQ, securityAnswerHash: secAnswerHash,
      balance: bonus, freeSlots: spins,
      id: Math.floor(Math.random() * 900000) + 100000,
      tag: 'Новачок 🌱', avatar: '👤',
      dailyStreak: 0, luckyGamesLeft: 3, luckyGamesUsed: 0,
      registeredAt: Date.now(), lastSeen: Date.now(),
      totalGames: 0, totalWins: 0, totalWagered: 0, slotsPlayed: 0,
    };
    if(promo) newUser.usedPromo = promo;
    const refBy = localStorage.getItem('ref_by');
    if(refBy && refBy !== n) newUser.referredBy = refBy;

    // Step 3: save to Firebase
    db.ref('users/' + n).set(newUser, err => {
      clearTimeout(timeout);
      if(err) {
        reset();
        console.error('Register write error:', err);
        return showAuthError('❌ Помилка запису: ' + (err.message || err.code || 'перевір правила Firebase'));
      }

      // Step 4: success!
      if(btn) btn.textContent = 'Входимо…';
      currentUser = n;
      localStorage.setItem(SESSION_KEY, n);
      localStorage.removeItem('ref_by');
      initTelegramLinkStatus();

      // Add to history (non-blocking)
      try { db.ref('users/' + n + '/history').push({ text: '🎉 Реєстрація! Бонус: +' + bonus + '₴', date: Date.now() }); } catch(e) { console.warn(e); }
      if(newUser.referredBy) {
        try { db.ref('users/' + newUser.referredBy + '/referrals').set(firebase.database.ServerValue.increment(1)); } catch(e) { console.warn(e); }
      }

      notify('🎉 Вітаємо! Бонус: ' + bonus + '₴ + ' + spins + ' фріспінів!' + bonusMsg, 'success');

      // Start data sync after short delay
      setTimeout(() => {
        try { startDataSync(); } catch(e) { console.error('startDataSync err:', e); }
      }, 200);
    });

  }, err => {
    clearTimeout(timeout);
    reset();
    console.error('Register check error:', err);
    showAuthError('❌ Firebase помилка: ' + (err.message || err.code || 'невідома'));
  });
}

