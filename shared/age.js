// ============================================================
// SlotOK — вікове обмеження. Одне число на браузер і сервер.
//
// Браузер вантажить файл звичайним <script> перед app.js (усе стає
// глобальним), сервер (api/auth.js) — через require(). Міняєш MIN_AGE —
// він міняється в текстах, у формі реєстрації і в перевірці на сервері.
//
// TODO: перевірити вікове обмеження з юристом — ставки на спорт, лут-бокси,
// краш, міни та інші гральні механіки на віртуальні гривні при 13+.
// ============================================================

const MIN_AGE = 13;
const MAX_AGE = 120;

// Повних років на дату `now` за датою народження "YYYY-MM-DD".
// Повертає null, якщо дата невалідна або в майбутньому.
function ageFromBirthDate(birth, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const t = new Date(now);
  let age = t.getUTCFullYear() - y;
  if (t.getUTCMonth() + 1 < mo || (t.getUTCMonth() + 1 === mo && t.getUTCDate() < d)) age--;
  if (age < 0 || age > MAX_AGE) return null;
  return age;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MIN_AGE, MAX_AGE, ageFromBirthDate };
}
