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
  // Пароль перевіряє лише сервер (api/auth.js): хеш ніколи не їде в браузер,
  // а правила бази без Firebase Auth-сесії однаково нічого не пустять.
  reset();
  return showAuthError('⚠️ Сервер входу недоступний. Спробуй за хвилину.');
}

async function authRegister() {
  const email    = (document.getElementById('regEmail')?.value || '').trim();
  const n        = (document.getElementById('regName')?.value  || '').trim();
  const p        = (document.getElementById('regPass')?.value  || '');
  const promo    = (document.getElementById('regPromo')?.value || '').trim().toUpperCase();
  const secQ     = readSecQuestion('reg');
  const secA     = (document.getElementById('regSecAnswer')?.value || '').trim();
  const birthDate = document.getElementById('regBirth')?.value || '';

  // Validation
  const step1Err = regStep1Error(n, p);
  if(step1Err) { regStep(1); return showAuthError(step1Err); }
  if(secQ.length < 3) return showAuthError('Напиши своє контрольне питання (мінімум 3 символи) або обери зі списку');
  if(secA.length < 3) return showAuthError('Відповідь на контрольне питання — мінімум 3 символи (потрібна для відновлення пароля)');
  if(!db)            return showAuthError('Немає зʼєднання з Firebase. Перевір інтернет.');
  // Згода з Умовами та Політикою (+ дозвіл батьків до 18 років) — обовʼязкова.
  if(!document.getElementById('regConsent')?.checked) return showAuthError('Постав позначку, що приймаєш Умови та Політику');
  const minor = (ageFromBirthDate(birthDate) ?? 99) < 18;

  const btn = document.getElementById('regBtn');
  if(btn) { btn.textContent = 'Створюємо акаунт…'; btn.disabled = true; }
  const reset = () => { if(btn) { btn.textContent = 'Створити акаунт'; btn.disabled = false; } };

  // Серверна реєстрація: акаунт і стартовий бонус створює сервер, а не браузер.
  const refByLs = localStorage.getItem('ref_by');
  const srv = await serverAuthCall('register', {
    nick: n, password: p, birthDate, email, promo, secQ, secA, ref: refByLs && refByLs !== n ? refByLs : undefined,
    termsAccepted: true, termsVersion: TERMS_VERSION, parentConsent: minor ? true : undefined,
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
  // Акаунт створює лише сервер (хеші пароля й відповіді — у закритий user_secrets).
  reset();
  return showAuthError('⚠️ Сервер реєстрації недоступний. Спробуй за хвилину.');
}

