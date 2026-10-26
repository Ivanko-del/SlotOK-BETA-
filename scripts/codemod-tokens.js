// Переводить «сирі» кольори, радіуси й шрифти на дизайн-токени (src/css/00-tokens.css).
//
//   node scripts/codemod-tokens.js [--dry] [файли…]
//
// Без аргументів обробляє index.html, src/app/*.js і src/css/50-legacy.css.
// Чіпає ЛИШЕ CSS-декларації: правила в .css, атрибути style="…" (в HTML і
// в JS-шаблонах), el.style.x = '…', style.cssText = '…', style.setProperty().
// Кольори для canvas (ctx.fillStyle) і дані (масиви кольорів) не чіпає — там
// var() не працює.
//
// Колір → токен за контекстом властивості:
//   фон      → --bg / --surface-1..3 / --paper, тоновані — color-mix() з поверхнею
//   межа     → --line / --line-strong
//   текст    → --fg / --fg-2 / --fg-3 / --fg-4, на кольоровому фоні — --on-*
//   тінь     → нейтральна лишається (rgb(var(--shade-rgb) / a)), кольорові
//              «світіння» й білі внутрішні відблиски прибираються — у системі
//              немає глоу (DESIGN_SYSTEM.md).
// Скрипт ідемпотентний: те, що вже на токенах, не змінюється.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── Розбір кольору ───────────────────────────────────────────────────
const NAMED = {
  white: '#ffffff', black: '#000000', gold: '#ffd700', red: '#ff0000', green: '#008000',
  lime: '#00ff00', orange: '#ffa500', yellow: '#ffff00', cyan: '#00ffff', silver: '#c0c0c0',
  gray: '#808080', grey: '#808080', purple: '#800080', pink: '#ffc0cb', blue: '#0000ff',
};

function parseColor(str) {
  str = str.trim();
  let m;
  if ((m = str.match(/^#([0-9a-f]{3,8})$/i))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? +(parseInt(h.slice(6, 8), 16) / 255).toFixed(2) : 1;
    return { r, g, b, a: String(a) };
  }
  if ((m = str.match(/^rgba?\(\s*([^()]*)\)$/i))) {
    const parts = m[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = parts.slice(0, 3).map(Number);
    if (ch.some((n) => !Number.isFinite(n))) return null;
    const a = parts[3] !== undefined ? parts[3] : '1';
    return { r: ch[0], g: ch[1], b: ch[2], a };
  }
  const n = NAMED[str.toLowerCase()];
  return n ? parseColor(n) : null;
}

function hsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h, s, l: l * 100 };
}

function isNeutral(c) {
  const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const { l, s } = hsl(c);
  if (l < 20) return spread < 30;
  return spread < 22 || s < 0.12;
}

function hueToken(c) {
  const { h } = hsl(c);
  if (h >= 15 && h < 65) return 'accent';
  if (h >= 65 && h < 165) return 'pos';
  if (h >= 165 && h < 195) return 'primary';
  if (h >= 195 && h < 250) return 'info';
  if (h >= 250 && h < 300) return 'special';
  return 'neg';
}

const ON = { accent: 1, pos: 1, neg: 1, warn: 1, info: 1, special: 1, primary: 1 };

function alphaExpr(a) { return /^[\d.]+$/.test(a) ? String(+a) : a; }

// ctx: bg | border | text | shadow | any
function mapColor(raw, ctx, env) {
  const c = parseColor(raw);
  if (!c) return null;
  const a = c.a;
  const translucent = a !== '1' && !(/^[\d.]+$/.test(a) && +a >= 0.999);
  const { l } = hsl(c);
  if (translucent && /^[\d.]+$/.test(a) && +a === 0) return 'transparent';

  if (isNeutral(c)) {
    if (translucent) {
      if (l > 50) {
        if (ctx === 'text') return `rgb(var(--fg-rgb) / ${alphaExpr(a)})`;
        return `rgb(var(--tint-rgb) / ${alphaExpr(a)})`;
      }
      if (ctx === 'bg') return /^[\d.]+$/.test(a)
        ? `rgb(var(--recess-rgb) / calc(${alphaExpr(a)} * var(--recess-k)))`
        : `rgb(var(--recess-rgb) / ${a})`;
      return `rgb(var(--shade-rgb) / ${alphaExpr(a)})`;
    }
    switch (ctx) {
      case 'bg':
        if (l <= 4) return 'var(--bg)';
        if (l <= 9) return 'var(--surface-1)';
        if (l <= 14) return 'var(--surface-2)';
        if (l <= 24) return 'var(--surface-3)';
        if (l <= 40) return 'var(--line-strong)';
        if (l < 82) return 'var(--fg-3)';
        return 'var(--paper)';
      case 'border':
        if (l <= 30) return 'var(--line)';
        if (l <= 55) return 'var(--line-strong)';
        if (l < 82) return 'var(--fg-3)';
        return 'var(--fg)';
      case 'text':
        if (env && env.bgToken && ON[env.bgToken]) return `var(--on-${env.bgToken})`;
        if (env && env.paperBg) return l > 50 ? 'var(--paper)' : 'var(--paper-ink)';
        if (l >= 88) return 'var(--fg)';
        if (l >= 62) return 'var(--fg-2)';
        if (l >= 40) return 'var(--fg-3)';
        if (l >= 18) return 'var(--fg-4)';
        return 'var(--on-accent)';
      case 'shadow':
        return l > 50 ? `rgb(var(--tint-rgb) / ${alphaExpr(a)})` : `rgb(var(--shade-rgb) / ${alphaExpr(a)})`;
      default:
        if (l >= 88) return 'var(--fg)';
        if (l <= 10) return 'var(--bg)';
        return null;
    }
  }

  const tok = hueToken(c);
  if (translucent) return `rgb(var(--${tok}-rgb) / ${alphaExpr(a)})`;
  switch (ctx) {
    case 'bg':
      if (l <= 24) return `color-mix(in srgb, var(--${tok}) ${Math.max(6, Math.min(26, Math.round(l * 1.1)))}%, var(--surface-1))`;
      if (l >= 85) return `color-mix(in srgb, var(--${tok}) 16%, var(--surface-1))`;
      return `var(--${tok})`;
    case 'border':
      if (l <= 22) return `rgb(var(--${tok}-rgb) / .35)`;
      return `var(--${tok})`;
    case 'text':
      if (l <= 22) return `var(--on-${tok})`;
      if (l >= 86) return 'var(--fg)';
      return `var(--${tok})`;
    default:
      return `var(--${tok})`;
  }
}

// ── Значення властивостей ───────────────────────────────────────────
const COLOR_RE = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_])|rgba?\((?:[^()]|\$\{[^}]*\})*\)|(?<=^|[\s:,('"])(?:white|black|gold|red|green|lime|orange|yellow|cyan|silver|gray|grey|purple|pink|blue)(?=$|[\s;,)'"!])/g;

function replaceColors(value, ctx, env) {
  // Усередині ${…} — це код: іменовані кольори там бувають порівняннями
  // (c === 'red'), тож там міняємо лише #hex і rgba().
  if (value.includes('${')) {
    let out = '', i = 0;
    while (i < value.length) {
      const k = value.indexOf('${', i);
      if (k === -1) { out += replaceColorsPlain(value.slice(i), ctx, env, true); break; }
      out += replaceColorsPlain(value.slice(i, k), ctx, env, true);
      let depth = 1, j = k + 2;
      while (j < value.length && depth) { if (value[j] === '{') depth++; else if (value[j] === '}') depth--; j++; }
      out += replaceColorsPlain(value.slice(k, j), ctx, env, false);
      i = j;
    }
    return out;
  }
  return replaceColorsPlain(value, ctx, env, true);
}

let NO_NAMED = false;   // увімкнено, коли «значення» насправді склеєне з JS-коду

function replaceColorsPlain(value, ctx, env, allowNamed) {
  if (NO_NAMED) allowNamed = false;
  return value.replace(COLOR_RE, (m) => {
    if (!allowNamed && /^[a-z]+$/i.test(m)) return m;
    if (m.startsWith('rgb') && m.includes('${')) {
      // rgba(212,175,55,${a}) — канали відомі, прозорість — вираз
      const inner = m.slice(m.indexOf('(') + 1, -1).split(',');
      if (inner.length === 4 && inner.slice(0, 3).every((x) => /^\s*\d+\s*$/.test(x))) {
        const c = { r: +inner[0], g: +inner[1], b: +inner[2], a: inner[3].trim() };
        if (isNeutral(c)) return hsl(c).l > 50 ? `rgb(var(--tint-rgb) / ${c.a})` : `rgb(var(--shade-rgb) / ${c.a})`;
        return `rgb(var(--${hueToken(c)}-rgb) / ${c.a})`;
      }
      return m;
    }
    return mapColor(m, ctx, env) || m;
  });
}

function splitTop(value, sep) {
  const out = []; let depth = 0, cur = '', q = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function isChromaticRaw(raw) {
  const c = parseColor(raw);
  return c ? !isNeutral(c) : false;
}

function processShadow(value) {
  if (value.includes('${')) return replaceColors(value, 'shadow');
  if (/^\s*(none|var\([^)]*\))\s*$/.test(value)) return value;
  const layers = splitTop(value, ',');
  const kept = [];
  for (const layer of layers) {
    const colors = layer.match(COLOR_RE) || [];
    const lengths = layer.replace(COLOR_RE, ' ').match(/-?[\d.]+(px|em|rem)?/g) || [];
    const blur = lengths.length >= 3 ? parseFloat(lengths[2]) : 0;
    const inset = /\binset\b/.test(layer);
    if (colors.length && isChromaticRaw(colors[0]) && blur > 0) continue;          // кольорове світіння
    if (/rgb\(var\(--(accent|pos|neg|warn|info|special|primary)-rgb\)/.test(layer) && blur > 0) continue;
    if (colors.length && inset) {
      const c = parseColor(colors[0]);
      if (c && isNeutral(c) && hsl(c).l > 50) continue;                            // білий «скос»
    }
    kept.push(replaceColors(layer, 'shadow').trim());
  }
  return kept.length ? kept.join(', ') : 'none';
}

function processFilter(value) {
  if (value.includes('${')) return value;
  let v = value.replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, (m) => {
    const col = (m.slice(12, -1).match(COLOR_RE) || [])[0];
    if (!col || isChromaticRaw(col) || /var\(--(accent|pos|neg|warn|info|special|primary)/.test(m)) return '';
    return replaceColors(m, 'shadow');
  }).replace(/\s{2,}/g, ' ').trim();
  return v || 'none';
}

function simplifyGradients(value) {
  return value.replace(/(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, (g) => {
      if (g.includes('${') || /transparent/.test(g)) return g;
      const toks = g.match(/var\(--[a-z0-9-]+\)|color-mix\((?:[^()]|\([^()]*\))*\)|rgb\(var\(--[a-z-]+\) \/ [^)]*\)/g) || [];
      const raw = g.match(COLOR_RE) || [];
      if (raw.length) return g;
      const uniq = [...new Set(toks.map((t) => t.replace(/\s+/g, ' ')))];
      return uniq.length === 1 ? uniq[0] : g;
    });
}

const BG_PROPS = /^(background|background-color|background-image|--[\w-]*bg[\w-]*)$/;
const BORDER_PROPS = /^(border|border-(top|right|bottom|left)|border(-(top|right|bottom|left))?-color|outline|outline-color|column-rule)$/;
const TEXT_PROPS = /^(color|-webkit-text-fill-color|fill|stroke|caret-color|text-decoration-color|accent-color|-webkit-text-stroke|-webkit-text-stroke-color|text-emphasis-color)$/;

function radiusPx(n) {
  if (n <= 0) return '0';
  if (n <= 4) return 'var(--r-xs)';
  if (n <= 7) return 'var(--r-sm)';
  if (n <= 11) return 'var(--r-md)';
  if (n <= 16) return 'var(--r-lg)';
  if (n <= 28) return 'var(--r-xl)';
  return 'var(--r-pill)';
}

function processDecl(prop, value, env) {
  const p = prop.toLowerCase();
  if (p.startsWith('--')) {
    return replaceColors(value, /bg/.test(p) ? 'bg' : 'any', env);
  }
  if (BG_PROPS.test(p)) return simplifyGradients(replaceColors(value, 'bg', env));
  if (BORDER_PROPS.test(p)) return replaceColors(value, 'border', env);
  if (TEXT_PROPS.test(p)) return replaceColors(value, 'text', env);
  if (p === 'box-shadow' || p === 'text-shadow') return processShadow(value);
  if (p === 'filter') return processFilter(value);
  if (p === 'font-family') {
    if (/Orbitron/i.test(value)) return 'var(--font-display)';
    if (/Rajdhani|-apple-system|system-ui|Segoe UI|sans-serif/i.test(value) && !/var\(/.test(value)) return 'var(--font-body)';
    if (/Courier|monospace/i.test(value) && !/var\(/.test(value)) return 'var(--font-mono)';
    return value;
  }
  if (p === 'border-radius' || /^border-(top|bottom)-(left|right)-radius$/.test(p)) {
    if (value.includes('${') || value.includes('%')) return value;
    return value.replace(/(?<![\w-])(\d+(?:\.\d+)?)px\b/g, (m, n) => radiusPx(+n));
  }
  return value;
}

// Розбирає список декларацій «a: b; c: d» (з можливими ${…} усередині).
function processDeclList(text) {
  const parts = splitTop(text, ';');
  // Спершу — фон, щоб текст знав, на чому стоїть.
  const env = { bgToken: null, paperBg: false };
  const parsed = parts.map((part) => {
    const m = part.match(/^(\s*)(-{0,2}[a-zA-Z][\w-]*)(\s*:\s*)([\s\S]*?)(\s*)$/);
    return m ? { pre: m[1], prop: m[2], colon: m[3], value: m[4], post: m[5] } : { raw: part };
  });
  for (const d of parsed) {
    if (d.raw !== undefined || !/^background(-color)?$/i.test(d.prop)) continue;
    const v = simplifyGradients(replaceColors(d.value, 'bg', {}));
    const mm = v.match(/^\s*var\(--(accent|pos|neg|warn|info|special|primary)\)\s*(!important)?\s*$/);
    if (mm) env.bgToken = mm[1];
    if (/var\(--paper\)/.test(v) && !/var\(--(bg|surface)/.test(v)) env.paperBg = true;
  }
  const out = [];
  for (const d of parsed) {
    if (d.raw !== undefined) { out.push(d.raw); continue; }
    const p = d.prop.toLowerCase();
    if (p === 'backdrop-filter' || p === '-webkit-backdrop-filter') continue;      // без «скла»
    let v = d.value, imp = '';
    const im = v.match(/\s*!important\s*$/);
    if (im) { imp = im[0]; v = v.slice(0, -im[0].length); }
    COLOR_RE.lastIndex = 0;
    out.push(d.pre + d.prop + d.colon + processDecl(d.prop, v, env) + imp + d.post);
  }
  return out.join(';');
}

// ── CSS-файл ─────────────────────────────────────────────────────────
function processCss(css) {
  let out = '', i = 0;
  // Простий рекурсивний обхід блоків: селектор { декларації | вкладені блоки }
  function walk(text, skip) {
    let res = '', pos = 0;
    while (pos < text.length) {
      const open = text.indexOf('{', pos);
      const commentStart = text.indexOf('/*', pos);
      if (commentStart !== -1 && (open === -1 || commentStart < open)) {
        const end = text.indexOf('*/', commentStart + 2);
        const stop = end === -1 ? text.length : end + 2;
        // декларації до коментаря (у межах блоку) обробляє виклик рівнем вище
        res += text.slice(pos, stop);
        pos = stop;
        continue;
      }
      if (open === -1) { res += text.slice(pos); break; }
      const selector = text.slice(pos, open);
      // знайти парну дужку
      let depth = 1, j = open + 1;
      while (j < text.length && depth) {
        if (text.startsWith('/*', j)) { const e = text.indexOf('*/', j + 2); j = e === -1 ? text.length : e + 2; continue; }
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      const sel = selector.trim();
      const skipThis = skip || /vcard|skin-swatch|skin-preview|card-skin/i.test(sel);
      let newBody;
      if (/^@(media|supports|layer|container)/.test(sel) || (body.includes('{') && !/^@keyframes|^@font-face/.test(sel))) {
        newBody = walk(body, skipThis);
      } else if (/^@keyframes/.test(sel)) {
        newBody = skipThis ? body : walk(body, skipThis);
      } else if (/^@font-face/.test(sel) || skipThis) {
        newBody = body;
      } else {
        newBody = processDeclBody(body);
      }
      res += selector + '{' + newBody + '}';
      pos = j;
    }
    return res;
  }
  function processDeclBody(body) {
    // коментарі всередині тіла лишаємо як є
    const chunks = body.split(/(\/\*[\s\S]*?\*\/)/);
    return chunks.map((c) => (c.startsWith('/*') ? c : processDeclList(c))).join('');
  }
  out = walk(css, false);
  return out;
}

// ── HTML / JS ────────────────────────────────────────────────────────
function processStyleAttrs(src) {
  // style="…", style=\"…\", style='…'
  let out = '', i = 0;
  const re = /style=(\\"|"|')/g;
  let m;
  while ((m = re.exec(src))) {
    const q = m[1];
    const start = m.index + m[0].length;
    // кінець: та сама лапка поза ${…}
    let j = start, depth = 0;
    while (j < src.length) {
      if (src.startsWith('${', j)) { depth++; j += 2; continue; }
      if (depth && src[j] === '}') { depth--; j++; continue; }
      if (!depth && src.startsWith(q, j)) break;
      if (!depth && src[j] === '\n' && q !== '"') break;
      j++;
    }
    if (j >= src.length) continue;
    const inner = src.slice(start, j);
    NO_NAMED = /['"`]\s*\+|\+\s*['"`]/.test(inner);
    out += src.slice(i, start) + processDeclList(inner);
    NO_NAMED = false;
    i = j;
    re.lastIndex = j + q.length;
  }
  return out + src.slice(i);
}

function camelToKebab(s) { return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()); }

function processJsStyleProps(src) {
  // el.style.color = '…' / cond ? '…' : '…'  (до кінця рядка або ;)
  src = src.replace(/\.style\.([a-zA-Z]+)(\s*=\s*)([^;\n]+)/g, (all, prop, eq, rhs) => {
    if (prop === 'cssText' || prop === 'setProperty') return all;
    const kebab = camelToKebab(prop);
    const rhs2 = rhs.replace(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g, (lit, q, body, off, whole) => {
      // 'red' у порівнянні (c === 'red') — це дані, а не стиль
      if (/[=!]=\s*$/.test(whole.slice(0, off)) || /^\s*[=!]==?/.test(whole.slice(off + lit.length))) return lit;
      const v = processDecl(kebab, body, {});
      return q + v + q;
    });
    return '.style.' + prop + eq + rhs2;
  });
  // style.setProperty('prop', '…')
  src = src.replace(/\.style\.setProperty\(\s*(['"])([\w-]+)\1\s*,\s*(['"])([^'"]*)\3/g, (all, q1, prop, q2, val) =>
    prop.startsWith('--') ? all : `.style.setProperty(${q1}${prop}${q1}, ${q2}${processDecl(prop, val, {})}${q2}`);
  // cssText = '…' (+ '…')*  /  cssText = `…`
  src = src.replace(/(cssText\s*\+?=\s*)((?:(['"`])(?:\\.|(?!\3)[^\\])*\3\s*(?:\+\s*)?)+)/g, (all, head, lits) => {
    const lits2 = lits.replace(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g, (lit, q, body) => q + processDeclList(body) + q);
    return head + lits2;
  });
  return src;
}

// ── Запуск ──────────────────────────────────────────────────────────
function run(files, dry) {
  let changed = 0;
  for (const f of files) {
    const abs = path.resolve(ROOT, f);
    const src = fs.readFileSync(abs, 'utf8');
    let out;
    if (f.endsWith('.css')) out = processCss(src);
    else if (f.endsWith('.html')) out = processStyleAttrs(src);
    else out = processJsStyleProps(processStyleAttrs(src));
    if (out !== src) {
      changed++;
      if (!dry) fs.writeFileSync(abs, out);
      console.log((dry ? '[dry] ' : '') + 'змінено: ' + f);
    }
  }
  console.log(`файлів змінено: ${changed}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  let files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    files = ['index.html', 'src/css/50-legacy.css',
      ...fs.readdirSync(path.join(ROOT, 'src/app')).filter((f) => f.endsWith('.js')).map((f) => 'src/app/' + f)];
  }
  run(files, dry);
}

module.exports = { mapColor, processDeclList, processCss, processStyleAttrs, processJsStyleProps };
