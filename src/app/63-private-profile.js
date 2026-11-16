// ============================================================
// ===== ПРИВАТНІ ПОЛЯ ПРОФІЛЮ (user_private/<нік>) =====
// ============================================================
// users/<нік> читають усі залогінені, тож email, хеш IP і Telegram-чат
// лежать у user_private/<нік> — туди пускає лише власника й адміна.
// Старі акаунти переносяться ліниво при вході (ідемпотентно); сервер
// (lib/private-profile.js) теж переносить при вході й читає обидва місця.
const PRIVATE_PROFILE_FIELDS = ['email', 'lastIpHash', 'telegramChatId'];
let privateData = {};
let _privateRef = null;

function initPrivateProfile() {
  if(!db || !currentUser) return;
  const me = currentUser;
  Promise.all([
    db.ref('users/' + me).once('value'),
    db.ref('user_private/' + me).once('value'),
  ]).then(([uSnap, pSnap]) => {
    if(me !== currentUser) return;
    const u = uSnap.val() || {}, p = pSnap.val() || {};
    const updates = {};
    PRIVATE_PROFILE_FIELDS.forEach(f => {
      if(u[f] === undefined || u[f] === null) return;
      // Нове місце не затираємо; з публічного вузла прибираємо в будь-якому разі.
      if(u[f] !== '' && (p[f] === undefined || p[f] === null || p[f] === '')) updates['user_private/' + me + '/' + f] = u[f];
      updates['users/' + me + '/' + f] = null;
    });
    if(Object.keys(updates).length) return db.ref().update(updates).catch(e => console.warn('private migrate:', e && e.message));
  }).catch(() => {}).then(() => {
    if(me !== currentUser) return;
    if(_privateRef) _privateRef.off();
    _privateRef = db.ref('user_private/' + me);
    _privateRef.on('value', snap => {
      privateData = snap.val() || {};
      const el = document.getElementById('profileEmail');
      if(el) el.textContent = privateData.email || '-';
    });
  });
}

function getPrivateProfile(field) { return privateData ? privateData[field] : undefined; }
