// Генерує статичні сторінки ігор для пошуковиків: /poker/, /durak/, /morskyi-biy/,
// /saper/, /bingo/, /crash/ (кожна — <slug>/index.html) і sitemap.xml.
// Сторінки звичайні HTML без JS-застосунку: опис і правила гри, кнопка
// «Грати» веде на /?play=<гра> — застосунок відкриє гру одразу після входу
// (PLAY_LINK_GAMES у src/app/08-auth-screen-horse-colorwheel.js).
// Стилі — style.css (класи .lp-*, src/css/73-landing.css).
//
// Запуск: node scripts/build-landing.js          (перезаписує файли)
//         node scripts/build-landing.js --check  (лише перевіряє, що вони свіжі)
//
// Факти в текстах — з рушіїв ігор (lib/room-games/*.js, lib/live.js,
// src/app/45-minesweeper.js, 46-battleship.js). Змінив правила — онови й тут.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = "https://slot-ok-beta.vercel.app";
const LASTMOD = "2026-10-27";

const PAGES = [
  {
    slug: "poker", game: "holdem", icon: "spade", short: "Покер 3D",
    title: "Покер Texas Hold'em онлайн з друзями — 3D-стіл безкоштовно | SlotOK",
    description: "Texas Hold'em на 2–6 гравців у 3D прямо в браузері: блайнди, рейзи, побічні банки й шоудаун. Грай з друзями на віртуальні гривні, без завантаження.",
    h1: "Покер Texas Hold'em онлайн у 3D",
    lead: "Стіл на 2–6 гравців прямо в браузері: роздача, блайнди, рейзи й шоудаун — як у справжньому холдемі, тільки на віртуальні гривні.",
    sections: [
      ["Як грати", [
        "Кожен отримує 2 закриті карти, на стіл виходять 5 спільних: флоп (3 карти), терн і рівер.",
        "Банк забирає найкраща комбінація з п'яти карт із семи доступних — від старшої карти до роял-флешу.",
        "На кожному колі торгівлі: фолд, чек, колл, рейз або олл-ін.",
        "Блайнди 10/20 і ростуть у 1,5 раза кожні 5 роздач — гра не затягується.",
        "Якщо хтось пішов олл-ін, а інші торгуються далі, сервер сам рахує побічні банки.",
      ]],
      ["Стіл і ставка", [
        "Ставка столу — це бай-ін: усі сідають з однаковими 1000 фішок.",
        "Гра йде, доки фішки не зберуться в одного, або 30 роздач — тоді банк столу ділиться пропорційно фішкам (комісія столу 5%).",
        "На хід 25 секунд: не встиг — сервер зробить чек або фолд; тричі поспіль — вибуваєш.",
      ]],
      ["Чесно", [
        "Карти роздає й рахує сервер: свої бачиш лише ти, колоду не бачить ніхто, на шоудауні карти відкриваються всім.",
      ]],
    ],
  },
  {
    slug: "durak", game: "durak", icon: "cards", short: "Дурень",
    title: "Дурень підкидний онлайн з друзями на 2–4 гравців | SlotOK",
    description: "Класичний підкидний дурень онлайн: колода 36 карт, від 2 до 4 гравців, підкидання й відбій. Безкоштовно, у браузері, на віртуальні гривні.",
    h1: "Дурень підкидний онлайн",
    lead: "Та сама гра, що й на кухні з друзями: колода 36 карт, козир, підкидання — тільки за онлайн-столом на 2–4 гравців.",
    sections: [
      ["Правила", [
        "Колода 36 карт (від шістки до туза), козир — остання карта колоди. Першим ходить той, у кого найменший козир.",
        "Підкидати можуть усі, крім того, хто відбивається, — карти тих рангів, що вже лежать на столі.",
        "На столі не більше 6 атак і не більше, ніж карт у руці захисника.",
        "Відбився — ходиш наступним; взяв — хід переходить через тебе.",
        "Після кожного ходу всі добирають до шести: спершу атакуючий, захисник останній.",
        "Коли колода скінчилась, хто лишився без карт — вийшов. Останній з картами — дурень.",
      ]],
      ["Стіл і ставка", [
        "Банк столу ділять усі гравці, крім дурня.",
        "На атаку й захист 30 секунд, на підкидання — 12. Не встиг — сервер сходить найменшою картою або візьме.",
      ]],
      ["Чесно", [
        "Тасує й роздає сервер: чужих карт і колоди не видно, кожен хід перевіряється за правилами.",
      ]],
    ],
  },
  {
    slug: "morskyi-biy", game: "battleship", icon: "ship", short: "Морський бій",
    title: "Морський бій онлайн — з другом 1 на 1 або з ботом | SlotOK",
    description: "Морський бій онлайн: поле 10×10, класичний флот, гра проти друга 1 на 1 або проти бота. Безкоштовно, прямо в браузері.",
    h1: "Морський бій онлайн",
    lead: "Класичний морський бій: розстав флот і топи кораблі суперника — проти бота для тренування або проти друга один на один.",
    sections: [
      ["Правила", [
        "Поле 10×10, флот: один чотирипалубний, два трипалубні, три двопалубні й чотири однопалубні кораблі.",
        "Кораблі не можуть торкатися навіть кутами — сервер перевіряє розстановку.",
        "Влучив — стріляєш ще раз, промахнувся — хід суперника.",
        "Навколо потопленого корабля клітинки позначаються промахами автоматично.",
      ]],
      ["Режими", [
        "З ботом — без ставок, грається одразу в браузері.",
        "Онлайн 1 на 1 — на ставку: 90 секунд на розстановку (не встиг — флот розставиться сам), 30 секунд на постріл, три прострочені ходи — поразка.",
      ]],
      ["Чесно", [
        "В онлайн-грі флот суперника знає лише сервер — підглянути його через браузер неможливо.",
      ]],
    ],
  },
  {
    slug: "saper", game: "minesweeper", icon: "mine", short: "Сапер",
    title: "Сапер онлайн — класичний Minesweeper і дуель з другом | SlotOK",
    description: "Сапер онлайн: три класичні рівні з рекордами на час і дуель з другом на однаковому полі. Безкоштовно, у браузері, на телефоні й ПК.",
    h1: "Сапер онлайн",
    lead: "Той самий Minesweeper, що й у Windows: три рівні складності, рекорди на час — і дуель, де двоє розміновують однакове поле наввипередки.",
    sections: [
      ["Соло", [
        "Рівні: Новачок (9×9, 10 мін), Любитель (16×16, 40 мін) і Профі (30×16, 99 мін).",
        "Перший клік завжди безпечний.",
        "Прапорець — правий клік, довге натискання або режим «прапорець» на телефоні.",
        "Клік по числу, біля якого стоїть потрібна кількість прапорців, відкриває сусідні клітинки.",
        "Найкращі часи потрапляють у таблицю рекордів.",
      ]],
      ["Дуель", [
        "Обидва гравці отримують однакове поле й однаковий безпечний старт — удачі першого кліку немає.",
        "Хто перший відкрив усі безпечні клітинки — виграв, хто підірвався — програв.",
        "Якщо час вийшов, перемагає той, хто відкрив більше.",
      ]],
      ["Чесно", [
        "У дуелі розташування мін знає лише сервер — відкрити поле заздалегідь неможливо.",
      ]],
    ],
  },
  {
    slug: "bingo", game: "bingo", icon: "ticket", short: "Бінго",
    title: "Бінго онлайн на 75 куль — до 30 гравців за столом | SlotOK",
    description: "Бінго онлайн: картка 5×5, 75 куль, приз за першу лінію й за повну картку. До 30 гравців в одній грі, безкоштовно, на віртуальні гривні.",
    h1: "Бінго онлайн",
    lead: "Масова гра до 30 гравців: кулі тягне сервер, картка позначається сама — лишається вболівати за свою лінію.",
    sections: [
      ["Правила", [
        "Картка 5×5 з центральною вільною клітинкою, кулі від 1 до 75.",
        "Нова куля — кожні 3,5 секунди; числа на картці позначаються автоматично.",
        "Перша повна лінія (рядок, стовпець чи діагональ) отримує 40% банку.",
        "Перша повністю закрита картка — 60% банку. Одночасні переможці ділять приз.",
      ]],
      ["Як потрапити в гру", [
        "Обираєш ставку — і потрапляєш за стіл до гравців з такою самою ставкою.",
        "Гра стартує за 45 секунд після відкриття столу, якщо зібралося хоча б двоє.",
      ]],
      ["Чесно", [
        "Порядок куль — секрет сервера до кожного витягу, підглянути наступну кулю не можна.",
      ]],
    ],
  },
  {
    slug: "crash", game: "livecrash", icon: "rocket", short: "Краш наживо",
    title: "Краш онлайн наживо — один політ для всіх гравців | SlotOK",
    description: "Краш наживо: один політ для всіх, видно чужі ставки й кешаути, автокешаут, множник до ×1000. Результат раунду можна перевірити. Віртуальні гривні.",
    h1: "Краш онлайн наживо",
    lead: "Один політ на всіх гравців: ракета злітає, множник росте — заберіть виграш до того, як вона впаде.",
    sections: [
      ["Як грати", [
        "Перед кожним раундом 9 секунд на ставку.",
        "Після старту множник росте від ×1,00; натисни «Забрати» будь-коли, поки ракета летить.",
        "Не встиг до падіння — ставка програна. Максимальний множник — ×1000.",
        "Автокешаут: задай множник заздалегідь, і сервер забере виграш сам, навіть якщо ти закрив вкладку.",
      ]],
      ["Разом з усіма", [
        "Усі гравці бачать той самий політ, чужі ставки й моменти кешаутів.",
        "Теоретична віддача гри — 96%.",
      ]],
      ["Перевірити можна", [
        "Точку падіння визначає сервер наперед: хеш раунду видно ще до старту, а ключ до нього відкривається після — результат не підлаштовується під ставки.",
      ]],
    ],
  },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(p) {
  const url = `${SITE}/${p.slug}/`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: p.h1, description: p.description, inLanguage: "uk", isPartOf: { "@id": `${SITE}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "SlotOK", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: p.short, item: url },
      ] },
    ],
  };
  const others = PAGES.filter((o) => o !== p)
    .map((o) => `<a class="lp-other" href="/${o.slug}/"><span class="ic i-${o.icon}" aria-hidden="true"></span>${esc(o.short)}</a>`).join("\n          ");
  const sections = p.sections.map(([h, items]) => `
      <section class="lp-sec">
        <h2>${esc(h)}</h2>
        ${items.length === 1 ? `<p>${esc(items[0])}</p>` : `<ul>\n          ${items.map((i) => `<li>${esc(i)}</li>`).join("\n          ")}\n        </ul>`}
      </section>`).join("\n");
  const play = `/?play=${p.game}`;
  return `<!DOCTYPE html>
<!-- Згенеровано scripts/build-landing.js — не редагуй вручну. -->
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${url}">
  <link rel="icon" href="/icons/icon-192.png">
  <meta name="theme-color" content="#F3EEE4">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SlotOK">
  <meta property="og:locale" content="uk_UA">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(p.h1)} — SlotOK">
  <meta property="og:description" content="${esc(p.description)}">
  <meta property="og:image" content="${SITE}/icons/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Unbounded:wght@500;700;800&display=swap">
  <link rel="stylesheet" href="/style.css">
</head>
<body class="lp">
  <header class="lp-top">
    <a class="lp-brand" href="/"><span class="brand-mark lp-mark" aria-hidden="true">S</span><span>SlotOK</span></a>
    <a class="btn btn-primary lp-top-cta" href="${play}">Грати</a>
  </header>
  <main class="lp-main">
    <nav class="lp-crumbs" aria-label="Навігація"><a href="/">SlotOK</a> <span aria-hidden="true">/</span> ${esc(p.short)}</nav>
    <div class="lp-hero">
      <span class="lp-hero-ic ic i-${p.icon}" aria-hidden="true"></span>
      <h1>${esc(p.h1)}</h1>
      <p class="lp-lead">${esc(p.lead)}</p>
      <a class="btn btn-primary btn-lg lp-cta" href="${play}"><span class="ic i-play" aria-hidden="true"></span> Грати безкоштовно</a>
      <p class="lp-note">На старт — 1 000 ₴ ігрових і 10 фріспінів. Без завантаження, з телефона чи комп'ютера.</p>
    </div>
${sections}
      <section class="lp-sec">
        <h2>Інші ігри на SlotOK</h2>
        <div class="lp-others">
          ${others}
        </div>
      </section>
  </main>
  <footer class="lp-foot">
    <p><b>18+ · Грай відповідально.</b> SlotOK — розважальна платформа: усі монети, баланси й виграші віртуальні та не мають грошової цінності. Реальних грошей тут немає.</p>
  </footer>
</body>
</html>
`;
}

function sitemap() {
  const urls = [`  <url><loc>${SITE}/</loc><lastmod>${LASTMOD}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`]
    .concat(PAGES.map((p) => `  <url><loc>${SITE}/${p.slug}/</loc><lastmod>${LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

const outputs = PAGES.map((p) => [path.join(ROOT, p.slug, "index.html"), page(p)]);
outputs.push([path.join(ROOT, "sitemap.xml"), sitemap()]);

if (process.argv.includes("--check")) {
  const stale = outputs.filter(([f, c]) => !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== c);
  if (stale.length) {
    console.error("Сторінки ігор застарілі — запусти npm run build:landing:\n" + stale.map(([f]) => "  " + path.relative(ROOT, f)).join("\n"));
    process.exit(1);
  }
  console.log("OK — сторінки ігор і sitemap.xml свіжі");
} else {
  for (const [f, c] of outputs) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); }
  console.log(`Записано ${PAGES.length} сторінок ігор і sitemap.xml`);
}

module.exports = { PAGES };
