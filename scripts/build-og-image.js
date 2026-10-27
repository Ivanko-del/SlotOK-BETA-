// Рендерить scripts/og-image.html у icons/og-image.jpg (1200×630) — картинку,
// яку показують Google, Telegram, Facebook тощо в прев'ю посилання на сайт.
// Запуск: node scripts/build-og-image.js  (потрібен Playwright з Chromium).
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto("file://" + path.join(__dirname, "og-image.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(__dirname, "..", "icons", "og-image.jpg"), type: "jpeg", quality: 88 });
  await browser.close();
  console.log("icons/og-image.jpg готово");
})();
