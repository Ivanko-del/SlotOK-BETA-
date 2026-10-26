// Збирає src/css/05-icons.css з набору src/icons/icons.js.
//
//   npm run build:icons              — перезібрати (потім npm run build:css)
//   node scripts/build-icons.js --check — перевірити, що CSS свіжий і що всі
//                                       іконки з карти емодзі (emoji-icons.js) існують
//
// Кожна іконка — клас .i-назва, що задає --ic: url(data:svg). Малює її
// .ic з 02-components.css маскою, тож колір — це currentColor.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const icons = require(path.join(root, 'src/icons/icons.js'));
const out = path.join(root, 'src/css/05-icons.css');

function svg(body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" ' +
    'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
}
function dataUri(s) {
  return 'data:image/svg+xml,' + s.replace(/"/g, "'").replace(/%/g, '%25').replace(/#/g, '%23')
    .replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\s+/g, ' ');
}

function build() {
  const names = Object.keys(icons).sort();
  let css = '/* ЗГЕНЕРОВАНО scripts/build-icons.js з src/icons/icons.js — не редагуй руками. */\n';
  css += '/* Емодзі-заміна (emoji-icons.js): символ лишається в тексті, але невидимий. */\n';
  css += '.emj { -webkit-text-fill-color: transparent; text-indent: -100em; overflow: hidden; white-space: nowrap;\n' +
    '  letter-spacing: 0; font-style: normal; text-shadow: none; line-height: 1; }\n';
  css += '.emj-hide { display: none !important; }\n';
  css += '.t-pos { color: var(--pos); } .t-neg { color: var(--neg); } .t-warn { color: var(--warn); }\n' +
    '.t-info { color: var(--info); } .t-special { color: var(--special); } .t-accent { color: var(--accent); }\n' +
    '.t-fg { color: var(--fg); } .t-muted { color: var(--fg-3); }\n';
  for (const n of names) css += `.i-${n} { --ic: url("${dataUri(svg(icons[n]))}"); }\n`;
  return css;
}

function checkMap() {
  const src = fs.readFileSync(path.join(root, 'emoji-icons.js'), 'utf8');
  const block = src.slice(src.indexOf('var EMOJI_ICONS = {'), src.indexOf('};', src.indexOf('var EMOJI_ICONS = {')));
  const missing = [];
  for (const m of block.matchAll(/:\s*'([a-z0-9-]*)(?: [a-z]+)?'/g)) if (m[1] && !icons[m[1]]) missing.push(m[1]);
  return [...new Set(missing)];
}

const built = build();
const missing = checkMap();
if (missing.length) { console.error('emoji-icons.js посилається на неіснуючі іконки: ' + missing.join(', ')); process.exit(1); }
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== built) { console.error('src/css/05-icons.css застарів — запусти `npm run build:icons`.'); process.exit(1); }
  console.log('OK — іконки зібрано, карта емодзі повна');
} else {
  fs.writeFileSync(out, built);
  console.log(`05-icons.css: ${Object.keys(icons).length} іконок, ${built.length} байт`);
}
