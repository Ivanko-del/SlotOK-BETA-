// Рендерить PNG-іконки PWA з icon-src.svg / icon-maskable-src.svg через Chromium (Playwright).
//   node scripts/render-icons.js
// Потрібен інтернет (шрифт Unbounded з Google Fonts) і встановлений playwright.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const FONT = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@800&display=block';
(async () => {
  const browser = await chromium.launch();
  const jobs = [['icon-src.svg', 'icons/icon-192.png', 192], ['icon-src.svg', 'icons/icon-512.png', 512], ['icon-maskable-src.svg', 'icons/icon-maskable-512.png', 512]];
  for (const [src, out, size] of jobs) {
    const svg = fs.readFileSync(path.join(root, src), 'utf8').replace(/<svg ([^>]*)width="512" height="512"/, `<svg $1width="${size}" height="${size}"`);
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${FONT}"><style>html,body{margin:0;background:transparent}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log('→', out);
  }
  await browser.close();
})();
