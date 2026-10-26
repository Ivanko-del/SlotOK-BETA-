// Збирає app.js з src/app/*.js (у порядку імен файлів: 01-…, 02-…).
//
//   npm run build:app            — перезібрати app.js
//   node scripts/build-app.js --check — лише перевірити, що app.js свіжий (CI)
//
// Чому так, а не кілька <script>: усі шматки — один глобальний скрипт з
// оголошеннями функцій, що піднімаються (hoisting) і подекуди перевизначають
// одна одну. Склеєний у тому самому порядку, він поводиться точно як раніше,
// а браузер, як і раніше, вантажить один файл. Редагувати ж можна маленькі
// тематичні файли.
//
// Щоб додати новий шматок — створи src/app/NN-назва.js з потрібним номером
// (порядок важливий лише для коду, що виконується одразу при завантаженні).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dir = path.join(root, "src", "app");
const out = path.join(root, "app.js");

const HEADER =
  "// ============================================================\n" +
  "// ЗГЕНЕРОВАНИЙ ФАЙЛ — не редагуй руками.\n" +
  "// Джерело: src/app/*.js, збірка: npm run build:app (scripts/build-app.js).\n" +
  "// ============================================================\n";

function build() {
  const files = fs.readdirSync(dir).filter((f) => /^\d\d-[a-z0-9-]+\.js$/.test(f)).sort();
  if (!files.length) throw new Error("src/app порожня");
  return HEADER + files.map((f) => {
    const body = fs.readFileSync(path.join(dir, f), "utf8");
    return `// ─── src/app/${f} ───\n` + (body.endsWith("\n") ? body : body + "\n");
  }).join("");
}

const built = build();
if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (current !== built) {
    console.error("app.js не збігається з src/app/*.js — запусти `npm run build:app` і закоміть app.js.");
    process.exit(1);
  }
  console.log("OK — app.js зібрано з src/app/*.js і він свіжий");
} else {
  fs.writeFileSync(out, built);
  console.log(`app.js зібрано: ${built.length} байт`);
}
