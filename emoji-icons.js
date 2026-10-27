/* Емодзі → власні іконки SlotOK (один стиль по всьому застосунку).
 *
 * Системні емодзі на телефонах різних фірм виглядають по-різному, тож у
 * розмітці й JS-шаблонах вони лишаються лише як «ключ»: цей скрипт знаходить
 * їх у тексті й підміняє на <span class="emj ic i-…">, а саму іконку малює
 * маска з src/css/05-icons.css (колір = currentColor, тобто йде за темою).
 * Сам символ лишається в тексті (невидимий), тож textContent, копіювання й
 * пошук працюють як раніше.
 *
 * EMOJI_ICONS: емодзі → 'назва' або 'назва тон'. Тон — pos/neg/warn/info/
 * special/accent/fg/muted (клас tn-…). Порожня назва — сховати (прапори біля
 * кодів валют). Емодзі поза картою (напр. ті, що гравці пишуть у чаті) не
 * чіпаємо — це їхній текст.
 * Набір іконок — src/icons/icons.js; нова іконка → npm run build:icons.
 * Не чіпає: input, textarea, option, <title>, SVG, canvas, alert(). */
(function () {
  'use strict';

  var EMOJI_ICONS = {
    '💰': 'money-bag warn', '🎰': 'slot', '🏆': 'trophy warn', '✅': 'check-circle pos', '🃏': 'cards',
    '⬅': 'arrow-left', '💎': 'diamond info', '🪙': 'coin special', '👑': 'crown warn', '🎁': 'gift accent',
    '🎯': 'target', '🎱': 'grid', '🎲': 'dice', '🎡': 'wheel', '❌': 'x-circle neg', '🛡': 'shield', '👤': 'user',
    '🎮': 'game-pad', '⚡': 'bolt warn', '⚽': 'ball', '🔄': 'refresh', '🚀': 'rocket', '🔥': 'fire accent',
    '🎟': 'ticket', '🔴': 'dot neg', '📺': 'tv', '🎨': 'palette', '🟢': 'dot pos', '❓': 'question',
    '🤖': 'robot', '📦': 'package', '📜': 'scroll', '💣': 'bomb', '⏳': 'hourglass', '⚔': 'swords',
    '🎩': 'top-hat', '👥': 'users', '🎳': 'bowling', '⚠': 'alert warn', '📊': 'bar-chart', '🎉': 'party accent',
    '🔒': 'lock', '🔻': 'triangle-down neg', '⭐': 'star warn', '✨': 'sparkle warn', '💸': 'cash-fly',
    '💳': 'card', '📋': 'clipboard', '🏦': 'bank', '🐉': 'dragon', '🔔': 'bell', '💬': 'chat',
    '🤝': 'handshake', '🚫': 'ban neg', '🔑': 'key', '💥': 'explosion accent', '📈': 'chart-up pos',
    '🎫': 'ticket', '🎈': 'balloon', '⚫': 'dot fg', '🏇': 'horse', '🔮': 'magic-ball special',
    '🔫': 'pistol', '❤': 'heart-fill neg', '🦆': 'duck', '🍒': 'cherry neg', '🔷': 'diamond-small info',
    '🏠': 'home', '🔢': 'hash', '♟': 'chess', '⚙': 'settings', '⏰': 'clock', '🔐': 'lock', '🗑': 'trash',
    '✉': 'mail', '🧹': 'broom', '😔': 'frown', '🧠': 'brain', '🟡': 'dot warn', '✈': 'send', '⏱': 'timer',
    '➕': 'plus', '📢': 'megaphone', '💀': 'skull', '⚖': 'scale', '🌀': 'vortex', '🐛': 'bug',
    '🔍': 'search', '✊': 'fist', '🗼': 'tower', '💍': 'ring', '🥇': 'medal-1 warn', '💜': 'heart-fill special',
    '📥': 'inbox', '📡': 'satellite', '👁': 'eye', '🤑': 'money warn', '🍋': 'lemon warn', '🏀': 'basketball',
    '🏒': 'hockey', '🎾': 'tennis', '📱': 'phone', '🚧': 'construction warn', '🚩': 'flag neg', '💡': 'bulb warn',
    '🏁': 'flag-checkered', '🏅': 'medal warn', '🥈': 'medal-2', '⏭': 'skip-forward', '🏳': 'flag',
    '🔊': 'volume', '🌑': 'moon', '📷': 'camera', '💾': 'save', '💠': 'diamond-small info', '🌐': 'globe',
    '🥉': 'medal-3 accent', '🖼': 'image', '🌌': 'galaxy special', '💚': 'heart-fill pos', '⏹': 'stop-square',
    '🔇': 'mute', '✂': 'scissors', '📩': 'mail', '⛔': 'no-entry neg', '🍀': 'clover pos', '🎴': 'cards',
    '📰': 'newspaper', '♠': 'spade', '🥂': 'champagne', '⬆': 'arrow-up', '🏈': 'american-football',
    '⚾': 'baseball', '🎭': 'masks', '📝': 'write', '📅': 'calendar', '🧤': 'hand', '💨': 'fast-forward',
    '⛓': 'chain', '👮': 'police', '😞': 'frown', '🌟': 'star warn', '↔': 'arrows-h', '📲': 'phone',
    '🦊': 'paw', '💵': 'cash', '⬇': 'arrow-down', '🥊': 'boxing-glove neg', '🎵': 'music', '💱': 'exchange',
    '📎': 'paperclip', '⚪': 'dot-ring', '🌕': 'moon-full', '✌': 'peace', '👋': 'wave', '📆': 'calendar',
    '😂': 'laugh', '🕐': 'clock', '🦁': 'paw', '🐺': 'paw', '📳': 'vibrate', '🌅': 'sunrise', '🌊': 'wave2 info',
    '📐': 'ruler', '🎛': 'sliders', '😎': 'cool', '🐋': 'fish', '✍': 'write', '↗': 'arrow-up-right',
    '📉': 'chart-down neg', '🗓': 'calendar', '📣': 'megaphone', '🍂': 'leaf accent', '🔁': 'repeat',
    '🆕': 'new', '🐞': 'bug', '🟠': 'dot accent', '🌈': 'rainbow', '🧑': 'user', '💙': 'heart-fill info',
    '🌸': 'flower special', '✏': 'pencil', '🤺': 'fencing', '🔱': 'trident', '😄': 'grin', '☠': 'skull',
    '🚪': 'door', '🏷': 'tag', '📨': 'mail', '📂': 'folder', '↩': 'arrow-return', '🛒': 'shopping-cart',
    '⬛': 'square fg', '🐎': 'horse', '🦄': 'unicorn', '🐴': 'horse', '📤': 'tray-out', '🏹': 'bow',
    '🖐': 'hand', '😮': 'shock', '🌱': 'sprout pos', '🎃': 'pumpkin accent', '🎄': 'xmas-tree pos',
    '😅': 'grin', '🔓': 'unlock', '❄': 'snowflake info', '🎥': 'video', '🐈': 'paw', '🎖': 'ribbon',
    '👢': 'run', '🌳': 'tree pos', '🚂': 'train', '🤍': 'heart', '🛠': 'tools', '☀': 'sun warn',
    '🔵': 'dot info', '😩': 'frown', '🔌': 'plug', '🕒': 'clock', '👨‍💼': 'office', '😊': 'smile',
    '🙌': 'clap', '🤔': 'think', '🌙': 'moon', '🦈': 'fish', '⛳': 'golf', '🥺': 'frown', '🏢': 'building',
    '🐯': 'paw', '🐻': 'paw', 'ℹ': 'info', '😱': 'shock', '💤': 'sleep', '🌲': 'tree pos', '🐢': 'paw',
    '🚶': 'walk', '🏃': 'run', '🌧': 'rain', '🔡': 'type', '📧': 'mail', '✋': 'hand', '👆': 'point-up',
    '🔞': 'eighteen neg', '↖': 'arrow-up-left', '↙': 'arrow-down-left', '↘': 'arrow-down-right',
    '📸': 'camera', '😐': 'meh', '😢': 'frown', '🔹': 'diamond-small info', '🔸': 'diamond-small accent',
    '🅰': 'type', '🙈': 'eyes', '🎪': 'circus-tent', '🔗': 'link', '🖥': 'monitor', '🧾': 'receipt',
    '🔧': 'wrench', '🗂': 'folder', '👨‍💻': 'coder', '👏': 'clap', '😤': 'angry', '💪': 'muscle',
    '💔': 'heart-broken neg', '🧊': 'ice info', '👾': 'invader', '🙋': 'hand', '💧': 'water info',
    '🔕': 'bell-off', '🟩': 'square pos', '🎀': 'bow2 special', '🟣': 'dot special', '⬜': 'square-ring',
    '🟦': 'square info', '🟨': 'square warn', '🟥': 'square neg', '📌': 'pushpin', '🆚': 'vs', '🌍': 'globe',
    '🧘': 'meditate', '📶': 'signal', '💻': 'laptop', '🦉': 'bird', '📬': 'mail', '🎢': 'roller-coaster',
    '👽': 'alien', '📹': 'video', '🦅': 'bird', '🦋': 'butterfly', '🐬': 'fish', '🦜': 'bird', '🐱': 'paw',
    '🛑': 'stop neg', '🥚': 'egg', '🦵': 'run', '🎊': 'party accent', '🌪': 'vortex', '🪨': 'rock',
    '🎬': 'video', '🏝': 'island', '🎆': 'fireworks accent', '⚓': 'anchor', '🚢': 'ship', '🌃': 'city', '🤠': 'cowboy',
    '⛩': 'temple', '🧙': 'wizard', '⛄': 'snowman', '💘': 'heart-fill neg', '🐙': 'octopus',
    '🏺': 'amphora', '🛰': 'satellite', '🍹': 'cocktail', '🏛': 'temple', '🏰': 'castle', '👻': 'ghost',
    '⛏': 'tools', '🌠': 'star-shooting warn', '🌴': 'palm',
    // Емодзі, що трапляються в контенті з бази (новини, бонуси, гравці-боти)
    '🎂': 'gift accent', '💯': 'hundred neg', '🙏': 'hand', '👍': 'thumbs-up', '👎': 'thumbs-up',
    '😁': 'grin', '😃': 'smile', '😀': 'smile', '🙂': 'smile', '😉': 'wink', '😡': 'angry', '😭': 'frown',
    '🥳': 'party accent', '🤩': 'star warn', '💫': 'sparkle warn', '🌞': 'sun warn', '🍾': 'champagne',
    '🧩': 'grid', '📍': 'pin', '🗝': 'key', '♥': 'heart-fill neg', '♦': 'diamond-suit neg', '♣': 'club',
    '🂠': 'card-back', '7️⃣': 'seven neg', '7️': 'seven neg', '🎤': 'mic', '🎶': 'music', '♾': 'infinity',
    '⚛': 'atom', '🧿': 'eye', '🪄': 'wizard', '🛍': 'shopping-bag', '🍎': 'apple neg', '🍏': 'apple pos',
    '🌋': 'volcano accent', '⛰': 'mountain', '🏔': 'mountain', '🪐': 'planet special', '☄': 'comet',
    '🏙': 'city', '🏗': 'construction', '💹': 'chart-up pos', '🏧': 'cash', '💲': 'money', '🔀': 'shuffle',
    '🔃': 'refresh', '🔙': 'arrow-left', '🔜': 'arrow-right', '▶': 'play', '⏸': 'pause', '⏩': 'fast-forward',
    '🆓': 'tag', '🆙': 'arrow-up', '🆒': 'cool', '🔔️': 'bell', '📛': 'tag', '🎗': 'ribbon', '🥷': 'ninja',
    '👶': 'baby', '💊': 'medicine', '🧸': 'paw', '🍬': 'gift', '🍭': 'gift', '🍕': 'gift', '☕': 'cocktail',
  };
  // Прапори (біля кодів валют/мов) — показуємо лише код, без картинки.
  var FLAG_RE = /^\p{Regional_Indicator}{2}$/u;

  // Емодзі-презентація, символ + VS16, «текстові» піктограми, вжиті як емодзі, і 7️⃣.
  var RE = /\p{Regional_Indicator}{2}|7️⃣?|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[\u{1F300}-\u{1FAFF}⬅⏱⏸-⏺⏭-⏯ℹ♠-♧↔-↙↩↪⌨⏏▶☀-➿])\p{Emoji_Modifier}?(?:‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️?)\p{Emoji_Modifier}?️?)*️?/gu;
  var QUICK = /[⬅⏱-⏺\uD83C-\uD83E☀-➿⬀-⯿⌚-⏿ℹ↔-↪]|7️/;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, TITLE: 1, NOSCRIPT: 1, CANVAS: 1 };
  var XHTML = 'http://www.w3.org/1999/xhtml';

  function lookup(seq) {
    if (EMOJI_ICONS[seq] !== undefined) return EMOJI_ICONS[seq];
    var bare = seq.replace(/[️\u{1F3FB}-\u{1F3FF}]/gu, '');
    if (EMOJI_ICONS[bare] !== undefined) return EMOJI_ICONS[bare];
    if (FLAG_RE.test(seq)) return '';
    return null;
  }

  function skipEl(el) {
    for (; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.nodeName] || el.namespaceURI !== XHTML) return true;
      if (el.classList.contains('emj') || el.hasAttribute('data-no-emoji') || el.isContentEditable) return true;
    }
    return false;
  }

  function makeIcon(seq, spec) {
    var s = document.createElement('span');
    s.textContent = seq;
    s.setAttribute('aria-hidden', 'true');
    if (!spec) { s.className = 'emj emj-hide'; return s; }
    var parts = spec.split(' ');
    s.className = 'emj ic i-' + parts[0] + (parts[1] ? ' tn-' + parts[1] : '');
    return s;
  }

  function convertText(node) {
    var text = node.nodeValue;
    if (!text || !node.parentNode || !QUICK.test(text) || skipEl(node.parentNode)) return;
    RE.lastIndex = 0;
    var frag = null, last = 0, m;
    while ((m = RE.exec(text))) {
      var spec = lookup(m[0]);
      if (spec === null) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(makeIcon(m[0], spec));
      last = m.index + m[0].length;
    }
    if (!frag) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function walk(root) {
    if (root.nodeType === 3) return convertText(root);
    if (root.nodeType !== 1 || skipEl(root)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], n;
    while ((n = w.nextNode())) if (n.nodeValue && QUICK.test(n.nodeValue)) list.push(n);
    list.forEach(convertText);
  }

  function run(records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'characterData') convertText(r.target);
      else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
    }
  }

  var mo = new MutationObserver(run);
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  function initial() { walk(document.documentElement); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initial);
  else initial();

  window.emojiIcons = {
    refresh: function (root) { walk(root || document.documentElement); },
    // Назва іконки для емодзі (для canvas і місць, де потрібен клас напряму)
    name: function (seq) { var s = lookup(seq); return s ? s.split(' ')[0] : null; },
    map: EMOJI_ICONS,
  };
})();
