// Self-check for the Battle Pass season math in app.js (getBpSeasonInfo / formatBpTimeLeft).
// app.js is a monolithic browser script with no module.exports, so this reimplements
// the same formulas in isolation and pins the boundary behavior — the part most likely
// to break silently (off-by-one on season rollover would wipe or freeze everyone's
// progress at the wrong instant). If you change the formulas in app.js, mirror the
// change here too. Run: node scripts/selfcheck-bp-season.js
const assert = require("assert");

const BP_SEASON_EPOCH = Date.UTC(2026, 0, 1);
const BP_SEASON_DAYS = 30;

function getBpSeasonInfo(now) {
  const len = BP_SEASON_DAYS * 86400000;
  const num = Math.floor((now - BP_SEASON_EPOCH) / len) + 1;
  const endsAt = BP_SEASON_EPOCH + num * len;
  return { num, endsAt };
}

function formatBpTimeLeft(ms) {
  if (ms <= 0) return "закінчується...";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return days > 0 ? `${days}д ${hours}г` : `${hours}г ${Math.floor((ms % 3600000) / 60000)}хв`;
}

// Season 1 starts exactly at the epoch.
assert.strictEqual(getBpSeasonInfo(BP_SEASON_EPOCH).num, 1);
// One millisecond before the epoch is still (nominally) season 0 — never shown to
// players since the site won't run before launch, but the math must not throw or wrap.
assert.strictEqual(getBpSeasonInfo(BP_SEASON_EPOCH - 1).num, 0);
// The last millisecond of season 1.
const oneSeasonMs = BP_SEASON_DAYS * 86400000;
assert.strictEqual(getBpSeasonInfo(BP_SEASON_EPOCH + oneSeasonMs - 1).num, 1);
// The exact rollover instant must already read as season 2 (half-open interval).
assert.strictEqual(getBpSeasonInfo(BP_SEASON_EPOCH + oneSeasonMs).num, 2);
// seasonEndsAt for season 1 must equal the rollover instant.
assert.strictEqual(getBpSeasonInfo(BP_SEASON_EPOCH).endsAt, BP_SEASON_EPOCH + oneSeasonMs);

assert.strictEqual(formatBpTimeLeft(0), "закінчується...");
assert.strictEqual(formatBpTimeLeft(-5000), "закінчується...");
assert.strictEqual(formatBpTimeLeft(2 * 86400000 + 3 * 3600000), "2д 3г");
assert.strictEqual(formatBpTimeLeft(5 * 3600000 + 30 * 60000), "5г 30хв");

console.log("OK — Battle Pass season boundary math and timer formatting are correct");

// ── Назви сезонів ──────────────────────────────────────────────────
// Сезони нумеруються нескінченно, а таблиця назв скінченна — найважливіше
// тут те, що номер поза таблицею НЕ ламає екран, а просто лишається
// безіменним «Сезоном N».
const fs = require("fs");
const path = require("path");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

const block = appSrc.slice(appSrc.indexOf("const BP_SEASONS = ["));
const nums = [...block.slice(0, block.indexOf("];")).matchAll(/\{\s*num:\s*(\d+)/g)].map(m => +m[1]);
assert.ok(nums.length >= 12, "очікуємо щонайменше 12 названих сезонів, знайдено " + nums.length);
assert.strictEqual(nums[0], 1, "таблиця сезонів має починатись з 1");
nums.forEach((n, i) => assert.strictEqual(n, i + 1, "номери сезонів мають іти підряд, розрив біля " + n));

const names = [...block.slice(0, block.indexOf("];")).matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
assert.strictEqual(new Set(names).size, names.length, "назви сезонів мають бути унікальні");

// Поведінка getBpSeasonTheme: у таблиці — своя назва, поза нею — порожня.
const SEASONS = nums.map((num, i) => ({ num, name: names[i] }));
const DEFAULT = { name: "", icon: "🎫" };
const getTheme = n => SEASONS.find(s => s.num === n) || DEFAULT;
assert.strictEqual(getTheme(1).name, names[0]);
assert.strictEqual(getTheme(nums.length).name, names[nums.length - 1]);
assert.strictEqual(getTheme(nums.length + 1).name, "", "сезон поза таблицею лишається безіменним");
assert.strictEqual(getTheme(9999).name, "");

console.log("OK — таблиця сезонів Battle Pass суцільна й безпечно вичерпується");

// ── Бонусні скрині після 50 рівня ──────────────────────────────────
// Беремо справжню bpBonusInfo з app.js: скриня кожні BP_BONUS_XP досвіду
// понад 50 рівнів, нічого — до 50-го, і видане не видається вдруге.
{
  const grab = (re) => { const m = re.exec(appSrc); assert.ok(m, "не знайдено: " + re); return m[0]; };
  const src = grab(/const BP_BONUS_XP = \d+;/) + "\n" + grab(/function bpBonusInfo\(bp\) \{[\s\S]*?\n\}/);
  const { BP_BONUS_XP: B, bpBonusInfo } = new Function("BP_MAX_LEVEL", "BP_XP_PER_LEVEL", src + "; return { BP_BONUS_XP, bpBonusInfo };")(50, 1000);
  assert.deepStrictEqual(bpBonusInfo({ xp: 49999, level: 49, bonusClaimed: 0 }).available, 0, "до 50 рівня скринь немає");
  assert.strictEqual(bpBonusInfo({ xp: 50000, level: 50, bonusClaimed: 0 }).available, 0);
  assert.strictEqual(bpBonusInfo({ xp: 50000 + B, level: 50, bonusClaimed: 0 }).available, 1);
  assert.strictEqual(bpBonusInfo({ xp: 50000 + 3 * B + 5, level: 50, bonusClaimed: 1 }).available, 2);
  assert.strictEqual(bpBonusInfo({ xp: 50000 + 3 * B + 5, level: 50, bonusClaimed: 1 }).progress, 5);
  assert.strictEqual(bpBonusInfo({ xp: 50000 + B, level: 50, bonusClaimed: 5 }).available, 0, "не мінус");
  console.log("OK — бонусні скрині Battle Pass після 50 рівня рахуються правильно");
}
