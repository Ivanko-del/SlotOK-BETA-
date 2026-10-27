// Локальний стенд для перевірки онлайн-ігор: node scripts/dev-stack.js
//
// Піднімає емулятори Firebase (Auth :9099 + Realtime Database :9000 з
// database.rules.json) і сервер http://localhost:8123, що віддає статику й
// api/*.js так само, як Vercel. Сторінка сама підключається до емуляторів
// (window.SLOTOK_EMULATOR), а сервер ходить у локальну базу
// (lib/emulator.js) — бойова база не чіпається.
//
// Потрібні Java і мережа для `npx firebase-tools` (перший запуск).
// Емулятори вже запущені окремо? SKIP_EMULATORS=1.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8123;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
delete process.env.VERCEL;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };
const EMU_TAG = `<script>window.SLOTOK_EMULATOR={db:["127.0.0.1",9000],auth:"http://127.0.0.1:9099"}</script>`;

function startEmulators() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slotok-emu-"));
  fs.copyFileSync(path.join(ROOT, "database.rules.json"), path.join(dir, "database.rules.json"));
  fs.writeFileSync(path.join(dir, "firebase.json"), JSON.stringify({
    database: { rules: "database.rules.json" },
    emulators: { auth: { port: 9099 }, database: { port: 9000 }, ui: { enabled: false }, singleProjectMode: true },
  }));
  const p = spawn("npx", ["-y", "firebase-tools@13.29.1", "emulators:start", "--only", "auth,database", "--project", "nye-slotok"], { cwd: dir, stdio: ["ignore", "pipe", "inherit"] });
  p.stdout.on("data", (d) => { if (/All emulators ready/.test(d)) console.log("emulators ready: auth :9099, database :9000"); });
  process.on("exit", () => p.kill());
  process.on("SIGINT", () => process.exit(0));
}

// Мінімальна обгортка req/res у стилі Vercel (req.body, res.status().json()).
function vercelRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(typeof b === "string" || Buffer.isBuffer(b) ? b : JSON.stringify(b)); return res; };
  return res;
}

async function handleApi(name, req, res) {
  const file = path.join(ROOT, "api", name + ".js");
  if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  try { req.body = raw && /json/.test(req.headers["content-type"] || "") ? JSON.parse(raw) : raw; } catch { req.body = {}; }
  try { await require(file)(req, vercelRes(res)); }
  catch (e) { console.error(`api/${name}:`, e); if (!res.headersSent) { res.statusCode = 500; res.end(); } }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const m = /^\/api\/([^/]+)$/.exec(url.pathname);
  if (m) return handleApi(m[1], req, res);
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  if (url.pathname === "/" ) file = path.join(ROOT, "index.html");
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    if (file.endsWith("index.html")) buf = Buffer.from(String(buf).replace("<head>", "<head>" + EMU_TAG));
    res.end(buf);
  });
}).listen(PORT, () => console.log(`dev stack: http://localhost:${PORT}`));

if (!process.env.SKIP_EMULATORS) startEmulators();
