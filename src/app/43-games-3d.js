// ============================================================
// 3D-ІГРИ (v110): Plinko 3D, Колесо удачі 3D, Кубики (Craps),
// Слот 5×3, Три в ряд.
//
// Результат кожного раунду рахує сервер (lib/games.js → api/play.js через
// serverPlay) — тут лише показ. Без сервера (режим legacy) ці ігри не
// грають у браузері взагалі, щоб баланс не писався з клієнта.
//
// WebGL (three.js r149, /vendor/three-0.149.0.min.js) вантажиться лише при
// відкритті 3D-гри. Без WebGL — запасний вигляд: CSS-3D кубики, CSS-колесо,
// 2D-дошка Plinko. Слот і «Три в ряд» — чистий CSS-3D.
// Кольори сцен беруться з токенів теми (src/css/00-tokens.css).
// ============================================================

// ── Спільне ──────────────────────────────────────────────────────────
let _threeP = null;
function g3dHasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}
function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (_threeP) return _threeP;
  _threeP = new Promise((resolve) => {
    if (!g3dHasWebGL()) return resolve(null);
    const s = document.createElement('script');
    s.src = '/vendor/three-0.149.0.min.js';
    s.onload = () => resolve(window.THREE || null);
    s.onerror = () => { _threeP = null; resolve(null); };
    document.head.appendChild(s);
  });
  return _threeP;
}
function g3dVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function g3dReduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
function g3dSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function g3dEaseOut(t) { return 1 - Math.pow(1 - t, 3); }
function g3dEaseOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
function g3dAnimate(duration, step) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const d = g3dReduced() ? Math.min(duration, 250) : duration;
    function f(now) {
      const t = Math.min(1, (now - t0) / d);
      step(t);
      if (t < 1) requestAnimationFrame(f); else resolve();
    }
    requestAnimationFrame(f);
  });
}

// Ставка і серверний раунд — спільний для всіх нових ігор.
async function g3dPlay(game, inputId, params, btn) {
  const bet = parseInt(document.getElementById(inputId)?.value) || 0;
  if (!validateBet(bet)) return null;
  if (btn) btn.disabled = true;
  try {
    const srv = await serverPlay(game, bet, params);
    if (srv.mode === 'legacy') { notify('Ця гра працює лише з серверною перевіркою — спробуй трохи пізніше.', 'error'); return null; }
    if (srv.mode !== 'server') return null;
    addWager(bet);
    return { bet, r: srv.r };
  } finally {
    if (btn) btn.disabled = false;
  }
}
function g3dFinish(gameName, bet, r, resultEl, extra) {
  const won = r.payout > 0;
  if (resultEl) {
    resultEl.classList.remove('is-win', 'is-lose');
    void resultEl.offsetWidth;
    resultEl.classList.add(won && r.payout >= bet ? 'is-win' : 'is-lose');
    resultEl.textContent = won
      ? `${extra ? extra + ' · ' : ''}×${r.mult} — +₴${formatNumber(r.payout)}`
      : `${extra ? extra + ' · ' : ''}Не пощастило — −₴${formatNumber(bet)}`;
  }
  addToHistory(`${gameName}: ${won ? '+₴' + formatNumber(r.payout) : '−₴' + formatNumber(bet)}`);
  if (won && r.payout > bet) triggerWinReaction(r.payout, gameName);
}

// Мінімальна «сцена»: рендерер у контейнері, світло, камера, цикл кадрів, що
// сам зупиняється, коли екран гри сховано.
function g3dStage(container, opts) {
  const T = window.THREE;
  container.querySelector('.g3d-loading')?.remove();
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  container.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(opts.fov || 38, 1, 0.1, 200);
  camera.position.set(...opts.cam);
  camera.lookAt(new T.Vector3(...(opts.look || [0, 0, 0])));
  const hemi = new T.HemisphereLight(0xffffff, 0x404050, 0.75);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, 0.85);
  sun.position.set(...(opts.sun || [4, 10, 8]));
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 50 });
  scene.add(sun);
  const tickers = new Set();
  let running = false;
  const st = { T, scene, camera, renderer, tickers, hemi, sun, container };
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (opts.fitWidth) { // тримати ширину сцени видимою на вузьких екранах
      const needH = opts.fitWidth / camera.aspect;
      camera.fov = Math.max(opts.fov || 38, 2 * Math.atan(needH / 2 / opts.fitDist) * 180 / Math.PI);
    }
    camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(container);
  window.addEventListener('resize', resize);
  resize();
  function loop(now) {
    if (!container.isConnected || container.closest('.screen.hidden')) { running = false; return; }
    tickers.forEach((f) => f(now));
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  st.start = () => { if (!running) { running = true; resize(); requestAnimationFrame(loop); } };
  st.resize = resize;
  return st;
}

// Текстура з canvas (написи на колесі, грані кубиків)
function g3dCanvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
function g3dColor(name, fallback) { return new THREE.Color(g3dVar(name) || fallback); }

// ══════════════════════════════════════════════════════════════════════
// PLINKO 3D
// ══════════════════════════════════════════════════════════════════════
const P3D = { stage: null, risk: 'med', ready: false, fallback: false, balls: 0, mults: null };
const P3D_MULTS = {
  low: [10, 3, 1.6, 1.4, 1.1, 1, 0.4, 1, 1.1, 1.4, 1.6, 3, 10],
  med: [33, 11, 4, 2, 1.1, 0.6, 0.2, 0.6, 1.1, 2, 4, 11, 33],
  high: [170, 24, 8.1, 2, 0.7, 0.2, 0.1, 0.2, 0.7, 2, 8.1, 24, 170],
};
const P3D_ROWS = 12, P3D_GAP = 0.62, P3D_ROWH = 0.6;

function setPlinko3dRisk(risk, el) {
  if (P3D.balls > 0) { notify('Дочекайся, поки кульки впадуть', 'info'); return; }
  P3D.risk = risk;
  document.querySelectorAll('.p3d-risk').forEach((b) => { b.classList.toggle('active', b === el); b.setAttribute('aria-checked', b === el); });
  renderPlinko3dBuckets();
}
function p3dTone(m) { return m >= 10 ? 'neg' : m >= 2 ? 'accent' : m >= 1 ? 'warn' : 'muted'; }
function renderPlinko3dBuckets(hit) {
  const el = document.getElementById('p3dBuckets');
  if (!el) return;
  el.innerHTML = P3D_MULTS[P3D.risk].map((m, i) =>
    `<span class="p3d-bucket tone-${p3dTone(m)}${hit === i ? ' is-hit' : ''}" aria-label="×${m}"><i>×</i>${m}</span>`).join('');
  if (P3D.stage && P3D.buckets) P3D.buckets.forEach((b, i) => b.material.color.copy(g3dColor('--' + (p3dTone(P3D_MULTS[P3D.risk][i]) === 'muted' ? 'line-strong' : p3dTone(P3D_MULTS[P3D.risk][i])), '#888')));
}
function p3dPegX(row, j) { return (j - (row + 2) / 2) * P3D_GAP; }
function p3dRowY(row) { return 3.6 - row * P3D_ROWH; }

async function initPlinko3d() {
  renderPlinko3dBuckets();
  const box = document.getElementById('p3dStage');
  if (P3D.stage) { p3dApplyTheme(); P3D.stage.start(); return; }
  if (P3D.fallback) return;
  const T = await loadThree();
  if (!T) { p3dFallback(box); return; }
  const st = g3dStage(box, { cam: [0, 0.6, 12.5], look: [0, -0.4, 0], fov: 40, fitWidth: 9.4, fitDist: 12.5, sun: [3, 8, 10] });
  P3D.stage = st;
  const board = new T.Mesh(new T.BoxGeometry(9.6, 9.2, 0.3), new T.MeshStandardMaterial({ roughness: 0.85 }));
  board.position.set(0, -0.2, -0.45);
  board.receiveShadow = true;
  st.scene.add(board);
  P3D.board = board;
  const pegGeo = new T.CylinderGeometry(0.07, 0.07, 0.5, 12);
  pegGeo.rotateX(Math.PI / 2);
  const pegMat = new T.MeshStandardMaterial({ metalness: 0.4, roughness: 0.35 });
  P3D.pegMat = pegMat;
  for (let r = 0; r < P3D_ROWS; r++) {
    for (let j = 0; j < r + 3; j++) {
      const peg = new T.Mesh(pegGeo, pegMat);
      peg.position.set(p3dPegX(r, j), p3dRowY(r), 0);
      peg.castShadow = true;
      st.scene.add(peg);
    }
  }
  P3D.buckets = [];
  for (let k = 0; k <= P3D_ROWS; k++) {
    const b = new T.Mesh(new T.BoxGeometry(P3D_GAP * 0.86, 0.5, 0.55), new T.MeshStandardMaterial({ roughness: 0.5 }));
    b.position.set((k - P3D_ROWS / 2) * P3D_GAP, p3dRowY(P3D_ROWS) - 0.15, 0);
    b.castShadow = b.receiveShadow = true;
    st.scene.add(b);
    P3D.buckets.push(b);
  }
  P3D.ballGeo = new T.SphereGeometry(0.16, 24, 16);
  p3dApplyTheme();
  st.start();
}
function p3dApplyTheme() {
  if (!P3D.stage) return;
  P3D.board.material.color.copy(g3dColor('--surface-2', '#1f2439')).multiplyScalar(document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0.6);
  P3D.pegMat.color.copy(g3dColor('--fg-2', '#c3bfd0'));
  renderPlinko3dBuckets();
}
function p3dFallback(box) {
  P3D.fallback = true;
  box.querySelector('.g3d-loading')?.remove();
  box.classList.add('is-fallback');
  const c = document.createElement('canvas');
  box.appendChild(c);
  P3D.canvas = c;
  p3dDraw2d([]);
}
function p3dDraw2d(balls) {
  const c = P3D.canvas; if (!c) return;
  const w = c.clientWidth || 360, h = c.clientHeight || 360;
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext('2d'); ctx.scale(2, 2);
  const sx = w / 9.6, cx = w / 2, sy = h / 9.2, oy = h * 0.06;
  const Y = (row) => oy + (3.6 - p3dRowY(row)) * sy;
  ctx.fillStyle = g3dVar('--fg-3');
  for (let r = 0; r < P3D_ROWS; r++) for (let j = 0; j < r + 3; j++) { ctx.beginPath(); ctx.arc(cx + p3dPegX(r, j) * sx, Y(r), 3, 0, 7); ctx.fill(); }
  ctx.fillStyle = g3dVar('--accent');
  balls.forEach((b) => { ctx.beginPath(); ctx.arc(cx + b.x * sx, oy + (3.6 - b.y) * sy, 6, 0, 7); ctx.fill(); });
}

// Позиція кульки на шляху: t від 0 до кількості рядів (дробові — переліт)
function p3dPathPos(path, t) {
  const row = Math.min(Math.floor(t), P3D_ROWS);
  const f = t - row;
  let x0 = 0;
  for (let i = 0; i < row; i++) x0 += (path[i] ? 0.5 : -0.5) * P3D_GAP;
  const top = p3dRowY(0) + 0.9;
  if (t < 0) return { x: 0, y: top + (-t) * 0.4 };
  const y0 = p3dRowY(row) + 0.21;
  if (row >= P3D_ROWS) return { x: x0, y: p3dRowY(P3D_ROWS) + 0.2 };
  const dx = (path[row] ? 0.5 : -0.5) * P3D_GAP;
  const y1 = (row + 1 < P3D_ROWS ? p3dRowY(row + 1) + 0.21 : p3dRowY(P3D_ROWS) + 0.2);
  // невеликий відскок угору, потім падіння (парабола)
  const x = x0 + dx * f;
  const y = y0 + (y1 - y0) * f + Math.sin(Math.PI * f) * 0.22;
  return { x, y };
}

async function playPlinko3d() {
  if (P3D.balls >= 5) { notify('Не більше 5 кульок одночасно', 'info'); return; }
  if (!P3D.stage && !P3D.fallback) await initPlinko3d();
  const res = await g3dPlay('plinko3d', 'p3dBet', { risk: P3D.risk }, null);
  if (!res) return;
  const { bet, r } = res;
  P3D.balls++;
  const resultEl = document.getElementById('p3dResult');
  const dur = 2600;
  if (P3D.stage) {
    const T = THREE, st = P3D.stage;
    const ball = new T.Mesh(P3D.ballGeo, new T.MeshStandardMaterial({ color: g3dColor('--accent', '#ff7a3d'), metalness: 0.3, roughness: 0.25, emissive: g3dColor('--accent', '#ff7a3d'), emissiveIntensity: 0.15 }));
    ball.castShadow = true;
    st.scene.add(ball);
    st.start();
    await g3dAnimate(dur, (t) => {
      const p = p3dPathPos(r.path, -1 + t * (P3D_ROWS + 1));
      ball.position.set(p.x, p.y, 0.05);
      ball.rotation.z -= 0.15;
    });
    const bk = P3D.buckets[r.bucket];
    g3dAnimate(400, (t) => { const s = 1 + Math.sin(Math.PI * t) * 0.35; bk.scale.set(1, s, 1); });
    setTimeout(() => { st.scene.remove(ball); ball.material.dispose(); }, 900);
  } else {
    await g3dAnimate(dur, (t) => p3dDraw2d([p3dPathPos(r.path, -1 + t * (P3D_ROWS + 1))]));
  }
  P3D.balls--;
  renderPlinko3dBuckets(r.bucket);
  g3dFinish('Plinko 3D', bet, r, resultEl, `Кошик ×${r.mult}`);
}

// ══════════════════════════════════════════════════════════════════════
// КОЛЕСО УДАЧІ 3D
// ══════════════════════════════════════════════════════════════════════
const W3D = { stage: null, fallback: false, spinning: false, angle: 0, bonusAngle: 0 };
const W3D_SEGMENTS = [0, 1.2, 0, 2, 0, 1.5, 0, 3, 0, 1.2, 0, 2, 0, 5, 0, 1.2, 0, 2, 0, 0, 0, 1.2, 0, 0, 1.2, 0, 0, 0, 'B', 0];
const W3D_BONUS = [1, 2, 2, 3, 3, 4, 5, 6, 8, 10, 16, 30];
function w3dSegColor(v) {
  if (v === 'B') return g3dVar('--special');
  if (v === 0) return g3dVar('--surface-3');
  if (v >= 5) return g3dVar('--neg');
  if (v >= 3) return g3dVar('--warn');
  if (v >= 2) return g3dVar('--accent');
  return g3dVar('--primary');
}
function w3dLabel(v) { return v === 'B' ? 'БОНУС' : v === 0 ? '×0' : '×' + v; }
// Текстура «обличчя» колеса: сегмент i центрований на куті i·w від верху за годинниковою
function w3dFaceTexture(values, colorFn, labelFn) {
  return g3dCanvasTex(1024, 1024, (ctx, W) => {
    const n = values.length, R = W / 2, w = (Math.PI * 2) / n;
    ctx.translate(R, R);
    values.forEach((v, i) => {
      const a0 = -Math.PI / 2 + i * w - w / 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 0.98, a0, a0 + w); ctx.closePath();
      ctx.fillStyle = colorFn(v); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = g3dVar('--ink-shadow') || '#05060e'; ctx.stroke();
      ctx.save();
      ctx.rotate(a0 + w / 2);
      ctx.fillStyle = v === 0 ? (g3dVar('--fg-3') || '#999') : '#1A0E08';
      ctx.font = `800 ${n > 20 ? 34 : 54}px Unbounded, Onest, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(labelFn(v), R * 0.9, 0);
      ctx.restore();
    });
    ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = g3dVar('--surface-1') || '#161a2d'; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = g3dVar('--ink-shadow') || '#05060e'; ctx.stroke();
  });
}
function renderWheel3dLegend() {
  const el = document.getElementById('w3dLegend');
  if (!el) return;
  const counts = {};
  W3D_SEGMENTS.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  el.innerHTML = Object.entries(counts).sort((a, b) => (a[0] === 'B') - (b[0] === 'B') || +a[0] - +b[0])
    .map(([v, c]) => `<span class="w3d-chip" style="--chip:${w3dSegColor(v === 'B' ? 'B' : +v)}">${w3dLabel(v === 'B' ? 'B' : +v)} <small>${c}/30</small></span>`).join('');
}
async function initWheel3d() {
  renderWheel3dLegend();
  const box = document.getElementById('w3dStage');
  if (W3D.stage) { w3dApplyTheme(); W3D.stage.start(); return; }
  if (W3D.fallback) return;
  const T = await loadThree();
  if (!T) { w3dFallback(box); return; }
  const st = g3dStage(box, { cam: [0, -1.2, 11], look: [0, 0.3, 0], fov: 40, fitWidth: 9, fitDist: 11, sun: [-4, 6, 10] });
  W3D.stage = st;
  const group = new T.Group();
  group.rotation.x = -0.18;
  st.scene.add(group);
  W3D.group = group;
  // Колесо — товстий диск; обличчя з текстурою спереду
  const wheel = new T.Group();
  group.add(wheel);
  W3D.wheel = wheel;
  const rim = new T.Mesh(new T.CylinderGeometry(4, 4, 0.5, 96, 1, true), new T.MeshStandardMaterial({ metalness: 0.5, roughness: 0.35 }));
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);
  W3D.rim = rim;
  const face = new T.Mesh(new T.CircleGeometry(4, 96), new T.MeshStandardMaterial({ roughness: 0.6 }));
  face.position.z = 0.25;
  wheel.add(face);
  W3D.face = face;
  // Кілки на межах сегментів
  const pinGeo = new T.CylinderGeometry(0.06, 0.06, 0.35, 8); pinGeo.rotateX(Math.PI / 2);
  W3D.pinMat = new T.MeshStandardMaterial({ metalness: 0.8, roughness: 0.2 });
  for (let i = 0; i < W3D_SEGMENTS.length; i++) {
    const a = Math.PI / 2 + (i + 0.5) * (Math.PI * 2 / W3D_SEGMENTS.length);
    const pin = new T.Mesh(pinGeo, W3D.pinMat);
    pin.position.set(Math.cos(a) * 3.85, Math.sin(a) * 3.85, 0.42);
    wheel.add(pin);
  }
  // Вказівник зверху
  const ptr = new T.Mesh(new T.ConeGeometry(0.32, 0.8, 4), new T.MeshStandardMaterial({ metalness: 0.2, roughness: 0.4 }));
  ptr.rotation.z = Math.PI;
  ptr.position.set(0, 4.35, 0.5);
  ptr.castShadow = true;
  group.add(ptr);
  W3D.ptr = ptr;
  // Бонусне колесо — менше, спереду, спершу сховане
  const bonus = new T.Group();
  bonus.position.set(0, 0, 0.9);
  bonus.scale.setScalar(0.001);
  group.add(bonus);
  W3D.bonus = bonus;
  const bRim = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 0.3, 64, 1, true), new T.MeshStandardMaterial({ metalness: 0.6, roughness: 0.3 }));
  bRim.rotation.x = Math.PI / 2;
  bonus.add(bRim);
  W3D.bRim = bRim;
  const bFace = new T.Mesh(new T.CircleGeometry(2.6, 64), new T.MeshStandardMaterial({ roughness: 0.5 }));
  bFace.position.z = 0.16;
  bonus.add(bFace);
  W3D.bFace = bFace;
  w3dApplyTheme();
  st.tickers.add(() => { if (!W3D.spinning) group.rotation.y = Math.sin(performance.now() / 1800) * 0.06; });
  st.start();
}
function w3dApplyTheme() {
  if (!W3D.stage) return;
  W3D.face.material.map?.dispose();
  W3D.face.material.map = w3dFaceTexture(W3D_SEGMENTS, w3dSegColor, w3dLabel);
  W3D.face.material.needsUpdate = true;
  W3D.bFace.material.map?.dispose();
  W3D.bFace.material.map = w3dFaceTexture(W3D_BONUS, (v) => (v >= 10 ? g3dVar('--neg') : v >= 4 ? g3dVar('--warn') : g3dVar('--special')), (v) => '×' + v);
  W3D.bFace.material.needsUpdate = true;
  W3D.rim.material.color.copy(g3dColor('--fg', '#f2ede3'));
  W3D.bRim.material.color.copy(g3dColor('--special', '#b892ff'));
  W3D.pinMat.color.copy(g3dColor('--fg-2', '#c3bfd0'));
  W3D.ptr.material.color.copy(g3dColor('--accent', '#ff7a3d'));
}
function w3dFallback(box) {
  W3D.fallback = true;
  box.querySelector('.g3d-loading')?.remove();
  box.classList.add('is-fallback');
  const n = W3D_SEGMENTS.length, w = 360 / n;
  const grad = W3D_SEGMENTS.map((v, i) => `${w3dSegColor(v)} ${(i - 0.5) * w}deg ${(i + 0.5) * w}deg`).join(',');
  box.innerHTML = `<div class="w3d-flat"><div class="w3d-flat-wheel" id="w3dFlat" style="background:conic-gradient(from 0deg, ${grad})"></div><div class="w3d-flat-ptr"></div></div>`;
}
// Кут, на який треба повернути колесо, щоб сегмент i опинився під вказівником
function w3dTargetAngle(current, i, n, turns) {
  const w = (Math.PI * 2) / n;
  const jitter = (Math.random() - 0.5) * w * 0.6;
  const base = i * w + jitter; // обертання за годинниковою — від'ємне по z, тож ціль = +кут
  let target = current - (current % (Math.PI * 2)) + base;
  while (target < current + turns * Math.PI * 2) target += Math.PI * 2;
  return target;
}
async function playWheel3d() {
  if (W3D.spinning) return;
  if (!W3D.stage && !W3D.fallback) await initWheel3d();
  const btn = document.getElementById('w3dBtn');
  W3D.spinning = true;
  const res = await g3dPlay('wheel3d', 'w3dBet', {}, btn);
  if (!res) { W3D.spinning = false; return; }
  btn.disabled = true;
  const { bet, r } = res;
  const resultEl = document.getElementById('w3dResult');
  resultEl.textContent = 'Крутимо…';
  const from = W3D.angle, to = w3dTargetAngle(from, r.segment, W3D_SEGMENTS.length, 5);
  await g3dAnimate(4600, (t) => {
    W3D.angle = from + (to - from) * g3dEaseOutQuint(t);
    if (W3D.wheel) W3D.wheel.rotation.z = W3D.angle;
    else document.getElementById('w3dFlat').style.transform = `rotate(${(-W3D.angle * 180) / Math.PI}deg)`;
  });
  if (r.bonus) {
    resultEl.textContent = 'БОНУС! Крутимо друге колесо…';
    resultEl.classList.add('is-win');
    if (W3D.bonus) {
      await g3dAnimate(500, (t) => W3D.bonus.scale.setScalar(Math.max(0.001, g3dEaseOut(t))));
      const bf = W3D.bonusAngle, bt = w3dTargetAngle(bf, r.bonusSegment, W3D_BONUS.length, 4);
      await g3dAnimate(3600, (t) => { W3D.bonusAngle = bf + (bt - bf) * g3dEaseOutQuint(t); W3D.bonus.rotation.z = W3D.bonusAngle; });
      setTimeout(() => g3dAnimate(400, (t) => W3D.bonus.scale.setScalar(Math.max(0.001, 1 - t))), 2500);
    } else {
      await g3dSleep(900);
    }
  }
  W3D.spinning = false;
  btn.disabled = false;
  g3dFinish('Колесо 3D', bet, r, resultEl, r.bonus ? `Бонус ×${r.mult}` : `Сектор ${w3dLabel(W3D_SEGMENTS[r.segment])}`);
}

// ══════════════════════════════════════════════════════════════════════
// КУБИКИ 3D (Craps)
// ══════════════════════════════════════════════════════════════════════
const CR = { stage: null, fallback: false, type: 'seven', sum: 7, rolling: false, dice: [] };
const CR_SUM_MULT = { 2: 34.9, 3: 17.4, 4: 11.6, 5: 8.7, 6: 6.9, 7: 5.8, 8: 6.9, 9: 8.7, 10: 11.6, 11: 17.4, 12: 34.9 };
const CR_LABEL = { small: 'Мала (2–6)', big: 'Велика (8–12)', seven: 'Сімка', doubles: 'Дубль' };
// Порядок матеріалів BoxGeometry: +x, −x, +y, −y, +z, −z; протилежні грані дають 7
const CR_FACES = [3, 4, 1, 6, 2, 5];

function setCrapsBet(type, el) {
  CR.type = type;
  if (type === 'sum') CR.sum = parseInt(document.getElementById('crSum').value) || 7;
  document.querySelectorAll('.cr-bet').forEach((b) => { b.classList.toggle('active', b === el); b.setAttribute('aria-checked', b === el); });
  const m = document.getElementById('crSumMult');
  if (m) m.textContent = '×' + CR_SUM_MULT[parseInt(document.getElementById('crSum').value) || 7];
}
function crDieFaceTex(v, bg, pip) {
  return g3dCanvasTex(256, 256, (ctx, W) => {
    const r = 46;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(6, 6, W - 12, W - 12, r) : ctx.rect(6, 6, W - 12, W - 12); ctx.stroke();
    const P = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
      5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] }[v];
    ctx.fillStyle = v === 1 ? (g3dVar('--neg') || '#c2183f') : pip;
    P.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * W, y * W, v === 1 ? 30 : 22, 0, Math.PI * 2); ctx.fill(); });
  });
}
async function initCraps() {
  const sel = document.getElementById('crSum');
  if (sel && !sel.options.length) {
    for (let s = 2; s <= 12; s++) sel.add(new Option(`${s} · ×${CR_SUM_MULT[s]}`, s, false, s === 7));
  }
  const box = document.getElementById('crStage');
  if (CR.stage) { CR.stage.start(); return; }
  if (CR.fallback) return;
  const T = await loadThree();
  if (!T) { crFallback(box); return; }
  const st = g3dStage(box, { cam: [0, 5.2, 6.2], look: [0, 0.2, 0.3], fov: 38, fitWidth: 6.2, fitDist: 8, sun: [3, 12, 5] });
  CR.stage = st;
  const felt = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshStandardMaterial({ color: g3dColor('--primary', '#3ccfbd').multiplyScalar(0.2), roughness: 1 }));
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  st.scene.add(felt);
  CR.felt = felt;
  // Борт столу
  const wall = new T.Mesh(new T.BoxGeometry(12, 0.8, 0.5), new T.MeshStandardMaterial({ roughness: 0.6 }));
  wall.position.set(0, 0.4, -3.4);
  wall.castShadow = wall.receiveShadow = true;
  st.scene.add(wall);
  CR.wall = wall;
  const bg = '#FBF8F2', pip = '#1B1A2E';
  const mats = CR_FACES.map((v) => new T.MeshStandardMaterial({ map: crDieFaceTex(v, bg, pip), roughness: 0.35 }));
  for (let i = 0; i < 2; i++) {
    const d = new T.Mesh(new T.BoxGeometry(1, 1, 1), mats);
    d.castShadow = true;
    d.position.set(i ? 1 : -1, 0.5, 0.6);
    d.quaternion.copy(crFaceUp(T, i ? 3 : 4, 0.4 * (i ? 1 : -1)));
    st.scene.add(d);
    CR.dice.push(d);
  }
  crApplyTheme();
  st.start();
}
function crApplyTheme() {
  if (!CR.stage) return;
  CR.felt.material.color.copy(g3dColor('--primary', '#3ccfbd')).multiplyScalar(document.documentElement.getAttribute('data-theme') === 'light' ? 0.6 : 0.2);
  CR.wall.material.color.copy(g3dColor('--accent', '#ff7a3d'));
}
// Орієнтація, за якої значення v дивиться вгору (+y), з поворотом yaw навколо осі y
function crFaceUp(T, v, yaw) {
  const i = CR_FACES.indexOf(v);
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(...normals[i]), new T.Vector3(0, 1, 0));
  return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
}
function crFallback(box) {
  CR.fallback = true;
  box.querySelector('.g3d-loading')?.remove();
  box.classList.add('is-fallback');
  const face = (v) => `<div class="cr-face f${v}">${'<i></i>'.repeat(v)}</div>`;
  box.innerHTML = `<div class="cr-flat">${[0, 1].map((i) => `<div class="cr-cube" id="crCube${i}">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div>`).join('')}</div>`;
}
const CR_CSS_ROT = { 1: 'rotateX(0deg) rotateY(0deg)', 6: 'rotateX(180deg)', 2: 'rotateY(-90deg)', 5: 'rotateY(90deg)', 3: 'rotateX(-90deg)', 4: 'rotateX(90deg)' };

async function playCraps() {
  if (CR.rolling) return;
  if (!CR.stage && !CR.fallback) await initCraps();
  const params = CR.type === 'sum' ? { type: 'sum', sum: parseInt(document.getElementById('crSum').value) || 7 } : { type: CR.type };
  const btn = document.getElementById('crBtn');
  CR.rolling = true;
  const res = await g3dPlay('craps', 'crBet', params, btn);
  if (!res) { CR.rolling = false; return; }
  btn.disabled = true;
  const { bet, r } = res;
  const resultEl = document.getElementById('crResult');
  resultEl.textContent = 'Кидаємо…';
  if (CR.stage) {
    const T = THREE;
    const plans = CR.dice.map((d, i) => {
      const start = new T.Vector3(i ? 1.2 : -0.4, 1.6, 4.2);
      const end = new T.Vector3((i ? 1 : -1) * (0.7 + Math.random() * 0.4), 0.5, -0.6 + Math.random() * 1.2);
      const axis = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const spins = 4 + Math.random() * 3;
      const q0 = d.quaternion.clone();
      const qEnd = crFaceUp(T, r.dice[i], Math.random() * Math.PI * 2);
      return { d, start, end, axis, spins, q0, qEnd };
    });
    await g3dAnimate(1900, (t) => {
      plans.forEach((p) => {
        // Траєкторія з двома відскоками: висота загасає
        const e = g3dEaseOut(t);
        const pos = p.start.clone().lerp(p.end, e);
        const bounce = t < 0.45 ? Math.sin((t / 0.45) * Math.PI) * 2.2 : t < 0.75 ? Math.sin(((t - 0.45) / 0.3) * Math.PI) * 0.7 : t < 0.9 ? Math.sin(((t - 0.75) / 0.15) * Math.PI) * 0.18 : 0;
        pos.y = 0.5 + bounce;
        p.d.position.copy(pos);
        const spin = new T.Quaternion().setFromAxisAngle(p.axis, p.spins * Math.PI * 2 * e).multiply(p.q0);
        const k = Math.max(0, (t - 0.55) / 0.45);
        p.d.quaternion.copy(spin).slerp(p.qEnd, k * k * (3 - 2 * k));
      });
    });
  } else {
    [0, 1].forEach((i) => {
      const c = document.getElementById('crCube' + i);
      c.style.transition = 'none';
      c.style.transform = `rotateX(${720 + Math.random() * 360}deg) rotateY(${720 + Math.random() * 360}deg)`;
      void c.offsetWidth;
      c.style.transition = 'transform 1.4s cubic-bezier(.2,.8,.2,1)';
      c.style.transform = CR_CSS_ROT[r.dice[i]];
    });
    await g3dSleep(g3dReduced() ? 200 : 1450);
  }
  CR.rolling = false;
  btn.disabled = false;
  const label = r.dice[0] + ' + ' + r.dice[1] + ' = ' + r.sum;
  g3dFinish('Кубики 3D', bet, r, resultEl, label);
}

// ══════════════════════════════════════════════════════════════════════
// СЛОТ 5×3 (CSS-3D барабани-циліндри)
// ══════════════════════════════════════════════════════════════════════
// Символи сервера (lib/games.js → slot5): 0 вишня … 7 вайлд, 8 скатер
const S5_SYMS = [
  { ic: 'cherry', tone: 'neg', name: 'Вишня' }, { ic: 'lemon', tone: 'warn', name: 'Лимон' },
  { ic: 'bell', tone: 'warn', name: 'Дзвін' }, { ic: 'clover', tone: 'pos', name: 'Конюшина' },
  { ic: 'diamond', tone: 'info', name: 'Діамант' }, { ic: 'crown', tone: 'accent', name: 'Корона' },
  { ic: 'seven', tone: 'neg', name: 'Сімка' }, { ic: 'star', tone: 'special', name: 'Вайлд' },
  { ic: 'gift', tone: 'primary', name: 'Подарунок' },
];
const S5_PAY = [[5, 15, 40], [5, 15, 40], [8, 20, 60], [10, 25, 80], [15, 40, 120], [25, 75, 250], [50, 150, 750], [100, 300, 1000]];
const S5_LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
];
const S5_FACES = 12, S5_STEP = 360 / S5_FACES;
const S5 = { built: false, angles: [0, 0, 0, 0, 0], spinning: false };
function s5SymHtml(s) { const d = S5_SYMS[s]; return `<span class="ic i-${d.ic}" aria-hidden="true"></span>`; }
function initSlot5() {
  if (S5.built) return;
  const win = document.getElementById('s5Window');
  if (!win) return;
  S5.built = true;
  win.innerHTML = [0, 1, 2, 3, 4].map((r) => `<div class="s5-reel"><div class="s5-cyl" id="s5Cyl${r}">${
    Array.from({ length: S5_FACES }, (_, f) => `<div class="s5-face tone-${S5_SYMS[(f + r * 3) % 7].tone}" style="--a:${f * S5_STEP}deg">${s5SymHtml((f + r * 3) % 7)}</div>`).join('')
  }</div></div>`).join('');
  const pt = document.getElementById('s5Paytable');
  if (pt) pt.innerHTML = `<div class="pay-grid">${S5_PAY.map((p, s) => `<div class="pay-row"><span class="tone-${S5_SYMS[s].tone}">${s5SymHtml(s)}</span><span>${S5_SYMS[s].name}</span><span class="num">3× ${p[0] / 10} · 4× ${p[1] / 10} · 5× ${p[2] / 10}</span></div>`).join('')}
    <div class="pay-row"><span class="tone-primary">${s5SymHtml(8)}</span><span>Подарунок (будь-де)</span><span class="num">3× 3 · 4× 10 · 5× 50</span></div></div>
    <p class="field-hint">Множники — від усієї ставки. Вайлд замінює всі символи, крім подарунка. Лінії рахуються зліва направо.</p>`;
}
// Грань f циліндра стоїть під кутом f·STEP; барабан повернуто на rotateX(−A),
// тож по центру вікна — грань A/STEP, над нею (рядок 0) — наступна, під нею
// (рядок 2) — попередня. A росте — символи їдуть згори вниз, як у справжньому слоті.
async function playSlot5() {
  if (S5.spinning) return;
  initSlot5();
  const btn = document.getElementById('s5Btn');
  S5.spinning = true;
  const res = await g3dPlay('slot5', 's5Bet', {}, btn);
  if (!res) { S5.spinning = false; return; }
  btn.disabled = true;
  const { bet, r } = res;
  const resultEl = document.getElementById('s5Result');
  resultEl.textContent = 'Крутимо…';
  resultEl.classList.remove('is-win', 'is-lose');
  document.getElementById('s5Lines').innerHTML = '';
  document.querySelectorAll('.s5-face.is-win').forEach((f) => f.classList.remove('is-win'));
  const fast = g3dReduced();
  await Promise.all([0, 1, 2, 3, 4].map(async (reel) => {
    const cyl = document.getElementById('s5Cyl' + reel);
    const faces = cyl.children;
    const turns = 3 + reel;
    const cur = S5.angles[reel];
    // Цільова грань: найближча кратна кроку, після N повних обертів
    let target = Math.ceil((cur + turns * 360) / S5_STEP) * S5_STEP;
    const center = ((target / S5_STEP) % S5_FACES + S5_FACES) % S5_FACES;
    // Ставимо символи результату на 3 грані, які зупиняться у вікні,
    // і випадкові — на решту (видно під час обертання)
    for (let f = 0; f < S5_FACES; f++) {
      const d = (f - center + S5_FACES) % S5_FACES;
      const row = d === 1 ? 0 : d === 0 ? 1 : d === S5_FACES - 1 ? 2 : -1;
      const sym = row >= 0 ? r.grid[reel][row] : Math.floor(Math.random() * 7);
      faces[f].className = `s5-face tone-${S5_SYMS[sym].tone}`;
      faces[f].dataset.row = row;
      faces[f].innerHTML = s5SymHtml(sym);
    }
    cyl.style.transition = `transform ${fast ? 0.3 : 1.4 + reel * 0.35}s cubic-bezier(.2,.75,.25,1.04)`;
    cyl.style.transform = `rotateX(${-target}deg)`;
    S5.angles[reel] = target;
    await g3dSleep(fast ? 320 : (1400 + reel * 350));
  }));
  // Підсвітка виграшних ліній
  const svg = document.getElementById('s5Lines');
  svg.innerHTML = r.lines.map((l) => {
    const pts = S5_LINES[l.line].slice(0, l.count).map((row, reel) => `${50 + reel * 100},${50 + row * 100}`).join(' ');
    return `<polyline points="${pts}" class="s5-line l${l.line}"/>`;
  }).join('');
  r.lines.forEach((l) => S5_LINES[l.line].slice(0, l.count).forEach((row, reel) => {
    const cyl = document.getElementById('s5Cyl' + reel);
    [...cyl.children].find((f) => +f.dataset.row === row)?.classList.add('is-win');
  }));
  if (r.scatters >= 3) document.querySelectorAll('.s5-face').forEach((f) => { if (+f.dataset.row >= 0 && f.querySelector('.i-gift')) f.classList.add('is-win'); });
  S5.spinning = false;
  btn.disabled = false;
  const parts = [];
  if (r.lines.length) parts.push(`${r.lines.length} ${r.lines.length === 1 ? 'лінія' : r.lines.length < 5 ? 'лінії' : 'ліній'}`);
  if (r.scatterMult) parts.push(`${r.scatters} подарунки ×${r.scatterMult}`);
  g3dFinish('Слот 5×3', bet, r, resultEl, parts.join(' · '));
}

// ══════════════════════════════════════════════════════════════════════
// ТРИ В РЯД (каскади, CSS-3D фішки)
// ══════════════════════════════════════════════════════════════════════
const M3_SYMS = [
  { ic: 'heart-fill', tone: 'neg' }, { ic: 'diamond-suit', tone: 'info' }, { ic: 'club', tone: 'pos' },
  { ic: 'spade', tone: 'special' }, { ic: 'moon', tone: 'warn' }, { ic: 'bolt', tone: 'accent' },
  { ic: 'crown', tone: 'primary' }, { ic: 'gem', tone: 'fg' },
];
const M3_PAY = [[0.29, 0.88, 2.3, 6], [0.34, 1.05, 2.9, 7], [0.49, 1.45, 3.4, 9], [0.58, 1.75, 4.9, 12],
  [0.88, 2.3, 5.9, 18], [1.15, 3.4, 8.8, 23], [1.75, 4.9, 11.7, 35], [2.9, 8.8, 23, 68]];
const M3 = { N: 6, busy: false, grid: null };
function m3Tile(sym, i, cls) {
  const d = M3_SYMS[sym];
  return `<div class="m3-tile tone-${d.tone}${cls ? ' ' + cls : ''}" data-i="${i}" style="--r:${Math.floor(i / M3.N)};--c:${i % M3.N}"><span class="m3-chip"><span class="ic i-${d.ic}" aria-hidden="true"></span></span></div>`;
}
function m3Render(grid, cls) {
  document.getElementById('m3Board').innerHTML = grid.map((s, i) => m3Tile(s, i, typeof cls === 'function' ? cls(i) : cls)).join('');
}
function initMatch3() {
  if (!M3.grid) {
    M3.grid = Array.from({ length: 36 }, () => Math.floor(Math.random() * 8));
    // Без випадкових «збігів» на заставці
    for (let i = 0; i < 36; i++) {
      const r = Math.floor(i / 6), c = i % 6;
      while ((c >= 2 && M3.grid[i] === M3.grid[i - 1] && M3.grid[i] === M3.grid[i - 2]) || (r >= 2 && M3.grid[i] === M3.grid[i - 6] && M3.grid[i] === M3.grid[i - 12])) M3.grid[i] = (M3.grid[i] + 1) % 8;
    }
    m3Render(M3.grid);
  }
  const pt = document.getElementById('m3Paytable');
  if (pt && !pt.innerHTML) pt.innerHTML = `<div class="pay-grid">${M3_PAY.map((p, s) => `<div class="pay-row"><span class="m3-mini tone-${M3_SYMS[s].tone}"><span class="ic i-${M3_SYMS[s].ic}" aria-hidden="true"></span></span><span class="num">3 → ×${p[0]} · 4 → ×${p[1]} · 5 → ×${p[2]} · 6 → ×${p[3]}</span></div>`).join('')}</div>
    <p class="field-hint">Множники — від ставки за кожен ряд чи стовпець. Каскади: 2-й ×2, 3-й ×3 … від 5-го ×5.</p>`;
}
async function playMatch3() {
  if (M3.busy) return;
  initMatch3();
  const btn = document.getElementById('m3Btn');
  M3.busy = true;
  const res = await g3dPlay('match3', 'm3Bet', {}, btn);
  if (!res) { M3.busy = false; return; }
  btn.disabled = true;
  const { bet, r } = res;
  const resultEl = document.getElementById('m3Result');
  const badge = document.getElementById('m3Cascade');
  resultEl.classList.remove('is-win', 'is-lose');
  resultEl.textContent = 'Нове поле…';
  const fast = g3dReduced();
  // Нове поле падає згори
  m3Render(r.start, 'is-drop');
  await g3dSleep(fast ? 100 : 650);
  let won = 0;
  let prev = r.start;
  for (const step of r.steps) {
    // 1) Збіги світяться й лопаються
    step.cells.forEach((i) => document.querySelector(`.m3-tile[data-i="${i}"]`)?.classList.add('is-hit'));
    won += step.mult;
    badge.textContent = step.cascade > 1 ? `Каскад ×${step.cascade}` : '';
    badge.classList.toggle('is-on', step.cascade > 1);
    resultEl.textContent = `+×${step.mult}${step.cascade > 1 ? ` (каскад ×${step.cascade})` : ''} · разом ×${Math.round(won * 100) / 100}`;
    await g3dSleep(fast ? 120 : 700);
    // 2) Гравітація: фішки, що лишились, з'їжджають; нові падають
    const hit = new Set(step.cells), shift = new Array(36).fill(0);
    for (let c = 0; c < 6; c++) {
      let removed = 0;
      for (let row = 5; row >= 0; row--) {
        const i = row * 6 + c;
        if (hit.has(i)) { removed++; continue; }
        shift[(row + removed) * 6 + c] = removed; // куди потрапила ця фішка
      }
      for (let row = 0; row < removed; row++) shift[row * 6 + c] = -1; // нові — падають згори
    }
    m3Render(step.grid, (i) => (shift[i] === -1 ? 'is-new' : shift[i] > 0 ? 'is-fall' : ''));
    document.querySelectorAll('#m3Board .m3-tile').forEach((t) => {
      const i = +t.dataset.i, s = shift[i];
      if (s > 0) t.style.setProperty('--from', s);
      if (s === -1) t.style.setProperty('--from', 1 + Math.floor(i / 6));
    });
    await g3dSleep(fast ? 120 : 520);
    prev = step.grid;
  }
  M3.grid = prev;
  badge.classList.remove('is-on');
  M3.busy = false;
  btn.disabled = false;
  g3dFinish('Три в ряд', bet, r, resultEl, r.steps.length ? `${r.steps.length} ${r.steps.length === 1 ? 'каскад' : r.steps.length < 5 ? 'каскади' : 'каскадів'}` : 'Без збігів');
}

// Тема змінилась — перефарбувати 3D-сцени (кольори беруться з токенів)
try {
  new MutationObserver(() => { setTimeout(() => { p3dApplyTheme(); w3dApplyTheme(); crApplyTheme(); }, 50); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'style'] });
} catch (e) { /* старі браузери */ }
