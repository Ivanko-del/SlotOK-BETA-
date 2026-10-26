// Збирає style.css з src/css/*.css (у порядку імен файлів: 00-…, 10-…).
//
//   npm run build:css            — перезібрати style.css
//   node scripts/build-css.js --check — лише перевірити, що style.css свіжий (CI)
//
// Так само, як app.js: браузер вантажить один файл, а правимо невеликі
// тематичні шматки. Порядок важить — пізніші правила перебивають ранні
// за однакової специфічності. Що де лежить — src/css/README.md.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dir = path.join(root, "src", "css");
const out = path.join(root, "style.css");

const HEADER =
  "/* ============================================================\n" +
  "   ЗГЕНЕРОВАНИЙ ФАЙЛ — не редагуй руками.\n" +
  "   Джерело: src/css/*.css, збірка: npm run build:css (scripts/build-css.js).\n" +
  "   ============================================================ */\n";

function build() {
  const files = fs.readdirSync(dir).filter((f) => /^\d\d-[a-z0-9-]+\.css$/.test(f)).sort();
  if (!files.length) throw new Error("src/css порожня");
  return HEADER + files.map((f) => {
    const body = fs.readFileSync(path.join(dir, f), "utf8");
    return `/* ─── src/css/${f} ─── */\n` + (body.endsWith("\n") ? body : body + "\n");
  }).join("");
}

const built = build();
if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (current !== built) {
    console.error("style.css не збігається з src/css/*.css — запусти `npm run build:css` і закоміть style.css.");
    process.exit(1);
  }
  console.log("OK — style.css зібрано з src/css/*.css і він свіжий");
} else {
  fs.writeFileSync(out, built);
  console.log(`style.css зібрано: ${built.length} байт`);
}
