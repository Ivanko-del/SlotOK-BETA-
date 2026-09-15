// Self-check: the Battle Pass level, the VIP ladder and the wager field must
// each have exactly ONE source in the app. All three previously drifted because
// the same numbers were hardcoded a second (and third) time on another screen:
//   * Головна читала userData.bpXp (поле, якого ніхто не пише) і ділила на 100,
//     тож показувала "Lv0", поки екран Battle Pass показував "Рівень 1".
//   * Екран VIP мав чотири захардкоджені картки (Bronze 0% / Silver 1% /
//     Gold 2% / Platinum 5%), яких движок (VIP_LEVELS) ніколи не платив,
//     плитки погодинного бонусу — ще чотири суми, а герб на Головній —
//     власний список із восьми рівнів; налаштування ж обіцяли фіксований
//     ракебек 0.5% від вейджеру.
//   * Половина екранів рахувала ставки по полю totalWager, хоча движок
//     пише totalWagered.
// Run: node scripts/selfcheck-progress-sources.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

// ── Battle Pass ────────────────────────────────────────────────────
assert.ok(!/userData\.bpXp\b/.test(app), "userData.bpXp is not a real field — use getBpData()");
const homeFn = app.slice(app.indexOf("function renderHomeProgressBars()"));
assert.ok(/getBpData\(\)/.test(homeFn.slice(0, 1500)), "home progress must read the level from getBpData()");
const bannerFn = app.slice(app.indexOf("function updateBannerDynamicContent()"));
assert.ok(/bpEl\.textContent = getBpData\(\)\.level \+ 1/.test(bannerFn.slice(0, 600)),
  "home banner must read the level from getBpData()");
// initBattlePass, home, banner and the level-up toast all display level+1
// (bp.level counts COMPLETED levels, the UI names the level in progress).
assert.ok(/getElementById\('bpLevel'\)\.textContent  = level \+ 1;/.test(app));
assert.ok(/Рівень \$\{newLevel \+ 1\}!/.test(app), "level-up toast must use the same 1-based numbering");

// The displayed level is a pure function of xp; pin it so the two call sites
// can't disagree again.
const BP_XP_PER_LEVEL = 1000;
const shownLevel = xp => Math.floor(xp / BP_XP_PER_LEVEL) + 1;
assert.strictEqual(shownLevel(0), 1);        // новий гравець — "Рівень 1, 0/1000"
assert.strictEqual(shownLevel(999), 1);
assert.strictEqual(shownLevel(1000), 2);     // рівно на межі вже другий рівень
assert.strictEqual(shownLevel(2500), 3);
assert.ok(new RegExp("const BP_XP_PER_LEVEL = " + BP_XP_PER_LEVEL + ";").test(app),
  "BP_XP_PER_LEVEL in app.js drifted from the value pinned here");

// Назви сезонів доїжджають до шапки. (Суцільність самої таблиці BP_SEASONS
// перевіряє selfcheck-bp-season.js.)
assert.ok(/id="bpSeasonName"/.test(html), "season header needs the theme slot");
assert.ok(/seasonName:\s+season\.name/.test(app), "getBpData() must pass the season theme through");

// ── VIP / кешбек / ракебек ─────────────────────────────────────────
assert.ok(!/Кешбек: \d/.test(html), "VIP levels must be rendered from VIP_LEVELS, not hardcoded in index.html");
assert.ok(/id="vipAllLevels"/.test(html), "index.html must keep the container updateVipUI() renders into");
assert.ok(/getElementById\('vipAllLevels'\)/.test(app), "updateVipUI() must render the VIP level list");
assert.ok(!/вейджеру/.test(html), "settings must not advertise a flat rakeback percentage");
assert.ok(!/function claimRakeback/.test(app), "claimRakeback() read totalWager, a field nothing writes");
assert.ok(!/claimRakeback\(\)"/.test(html), "nothing may still call claimRakeback()");
assert.ok(/function updateRakebackUI\(\)/.test(app), "settings rakeback panel needs its updater");
assert.ok(/onclick="claimCashback\(\)"/.test(html), "rakeback button must pay out the same pending cashback");

// ── Погодинний бонус ───────────────────────────────────────────────
assert.ok(!/hvt-(bronze|silver|gold|plat)/.test(html + app),
  "hourly tiles must be rendered from VIP_LEVELS, not four hardcoded ids");
assert.ok(/id="hourlyVipTiers"/.test(html), "index.html must keep the hourly tiles container");
assert.ok(/getElementById\('hourlyVipTiers'\)/.test(app), "updateVipUI() must render the hourly tiles");
assert.ok(/overflow-x: auto/.test(css.slice(css.indexOf(".hourly-vip-perks"), css.indexOf(".hourly-vip-perks") + 200)),
  "14 tiles need a scrolling row, not a squeezed one");

// ── Поле ставок ────────────────────────────────────────────────────
// Движок пише totalWagered. totalWager лишився лише як легасі-фолбек
// ("… || u.totalWager"), і жодне місце не сміє читати його першим.
const primaryReads = app.match(/(?<!\|\| )(?:data|userData|u|udata)\.totalWager\b/g) || [];
assert.deepStrictEqual(primaryReads, [],
  "totalWager may only be read as a legacy fallback, found: " + primaryReads.join(", "));
assert.ok(!/_VIP_LEVEL_NAMES/.test(app), "the home hero must use getVipLevel(), not its own VIP ladder");
assert.ok(!/'totalWager'/.test(app), "leaderboard must rank by totalWagered");

// ── Порожні <img> ──────────────────────────────────────────────────
assert.ok(/img:not\(\[src\]\)/.test(css), "src-less <img> must not render the broken-image icon");
assert.ok(/IMG_FALLBACK/.test(app), "broken images need the global fallback handler");

console.log("OK — Battle Pass level, VIP ladder and the wager field each have a single source");
