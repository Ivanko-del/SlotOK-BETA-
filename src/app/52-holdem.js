// ============================================================
// ПОКЕР TEXAS HOLD'EM 3D (v116): стіл на 2–6 гравців через сервер
// (lib/room-games/holdem.js). Стіл — three.js (як у 43-games-3d.js):
// сукно, борт, карти з текстурами, що перевертаються, фішки, кнопка дилера.
// Імена й стеки гравців — HTML поверх сцени, прив'язані до 3D-місць.
// Без WebGL — плаский стіл із тими самими картами (cardHtmlP).
// ============================================================

const HE = { stage: null, fallback: false, cards: {}, texCache: {}, seatEls: [], lastHand: 0, chips: null, button: null };
TBL_CFG.holdem = { name: 'Покер', render: holdemRender };
ROOM_HOOKS.holdem = { onJoined: (id) => tableOpen('holdem', id), onLeft: () => tableClose('holdem') };

// Місця за овальним столом: моє — знизу, решта по колу
function heSeatPos(k, n) {
  const a = Math.PI / 2 + (k / n) * Math.PI * 2;
  return { x: Math.cos(a) * 4.1, z: Math.sin(a) * 2.35 };
}
function heCardTex(card) {
  if (HE.texCache[card]) return HE.texCache[card];
  const t = g3dCanvasTex(180, 252, (ctx, W, H) => {
    if (card === 'back') {
      ctx.fillStyle = g3dVar('--paper') || '#fbf8f2'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = g3dVar('--accent') || '#ff7a3d'; ctx.fillRect(10, 10, W - 20, H - 20);
      ctx.strokeStyle = g3dVar('--paper') || '#fff'; ctx.lineWidth = 3;
      for (let i = -H; i < W; i += 16) { ctx.beginPath(); ctx.moveTo(i, 10); ctx.lineTo(i + H, H); ctx.stroke(); }
      return;
    }
    const r = card.slice(0, -1), s = card.slice(-1);
    const red = s === 'h' || s === 'd';
    ctx.fillStyle = g3dVar('--paper') || '#fbf8f2'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.fillStyle = red ? (g3dVar('--paper-red') || '#c2183f') : (g3dVar('--paper-ink') || '#1b1a2e');
    ctx.font = '900 56px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(r, 12, 8);
    ctx.font = '900 44px sans-serif'; ctx.fillText(SUIT_SYM[s], 14, 66);
    ctx.font = '900 120px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(SUIT_SYM[s], W - 10, H - 4);
  });
  HE.texCache[card] = t;
  return t;
}
function heCardMesh(T) {
  const g = new T.BoxGeometry(0.62, 0.012, 0.87);
  const side = new T.MeshStandardMaterial({ color: g3dColor('--paper', '#fbf8f2') });
  const face = new T.MeshStandardMaterial({ map: heCardTex('back'), roughness: 0.5 });
  const back = new T.MeshStandardMaterial({ map: heCardTex('back'), roughness: 0.5 });
  const m = new T.Mesh(g, [side, side, face, back, side, side]); // +y — лице
  m.castShadow = true;
  m.userData.card = null;
  return m;
}
function heSetCard(m, card) {
  if (m.userData.card === card) return;
  m.userData.card = card;
  m.material[2].map = heCardTex(card || 'back');
  m.material[2].needsUpdate = true;
}
// Плавно перевести меш у позицію (x,y,z) з поворотом
function heTween(m, to, ms) {
  const from = { x: m.position.x, y: m.position.y, z: m.position.z, r: m.rotation.z };
  const t0 = performance.now();
  m.userData.tween = (now) => {
    const k = Math.min(1, (now - t0) / ms), e = g3dEaseOut(k);
    m.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e + Math.sin(k * Math.PI) * 0.6 * (to.arc || 0), from.z + (to.z - from.z) * e);
    m.rotation.z = from.r + ((to.r || 0) - from.r) * e;
    if (k >= 1) m.userData.tween = null;
  };
}

async function initHoldem3d() {
  const box = document.getElementById('holdemStage');
  if (!box || HE.stage || HE.fallback) { if (HE.stage) HE.stage.start(); return; }
  const T = await loadThree();
  if (!T) { HE.fallback = true; box.classList.add('is-fallback'); box.querySelector('.g3d-loading')?.remove(); return; }
  const st = g3dStage(box, { cam: [0, 8.2, 6.6], look: [0, 0, 0.3], fov: 40, fitWidth: 10.5, fitDist: 10.5, sun: [2, 12, 4] });
  HE.stage = st;
  // Сукно й борт (овал = циліндр, розтягнутий по x)
  const felt = new T.Mesh(new T.CylinderGeometry(1, 1, 0.2, 64), new T.MeshStandardMaterial({ roughness: 0.95 }));
  felt.scale.set(4.6, 1, 2.75); felt.receiveShadow = true;
  const rim = new T.Mesh(new T.TorusGeometry(1, 0.08, 16, 80), new T.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }));
  rim.rotation.x = Math.PI / 2; rim.scale.set(4.75, 2.9, 2.6); rim.position.y = 0.12; rim.castShadow = true;
  const base = new T.Mesh(new T.CylinderGeometry(1, 0.92, 0.6, 64), new T.MeshStandardMaterial({ roughness: 0.8 }));
  base.scale.set(4.75, 1, 2.9); base.position.y = -0.4;
  st.scene.add(base, felt, rim);
  HE.felt = felt; HE.rim = rim; HE.base = base;
  // 5 карт борду
  HE.board = [0, 1, 2, 3, 4].map((i) => { const m = heCardMesh(T); m.position.set(-1.4 + i * 0.7, 3, -0.2); m.visible = false; st.scene.add(m); return m; });
  // Фішки банку
  HE.chipGeo = new T.CylinderGeometry(0.17, 0.17, 0.05, 24);
  HE.pot = new T.Group(); HE.pot.position.set(0, 0.11, 0.75); st.scene.add(HE.pot);
  HE.button = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.06, 24), new T.MeshStandardMaterial({ color: g3dColor('--paper', '#fff') }));
  HE.button.position.y = 0.13; HE.button.castShadow = true; st.scene.add(HE.button);
  HE.holes = []; // [seat][2] меші карт
  st.tickers.add((now) => {
    st.scene.traverse((o) => { if (o.userData.tween) o.userData.tween(now); });
    heLabels();
  });
  heApplyTheme();
  st.start();
}
function heApplyTheme() {
  if (!HE.stage) return;
  HE.felt.material.color.copy(g3dColor('--pos', '#3dd68c')).multiplyScalar(document.documentElement.getAttribute('data-theme') === 'light' ? 0.55 : 0.32);
  HE.rim.material.color.copy(g3dColor('--accent', '#ff7a3d')).multiplyScalar(0.7);
  HE.base.material.color.copy(g3dColor('--surface-3', '#333'));
}
function heChipStack(group, amount, x, z) {
  const T = window.THREE;
  const tones = ['--neg', '--info', '--pos', '--special', '--warn'];
  let n = amount > 0 ? Math.min(14, Math.max(1, Math.round(Math.log2(amount / 10 + 1) * 2))) : 0;
  for (let k = 0; k < n; k++) {
    const c = new T.Mesh(HE.chipGeo, new T.MeshStandardMaterial({ color: g3dColor(tones[k % tones.length], '#f00'), roughness: 0.4 }));
    c.position.set(x + (k % 3 === 2 ? 0.02 : 0), 0.03 + k * 0.052, z);
    c.castShadow = true;
    group.add(c);
  }
}

// Підписи місць (HTML) — проектуємо 3D-точки на екран
function heLabels() {
  const u = TBL.holdem && TBL.holdem.last;
  const wrap = document.getElementById('holdemSeats');
  if (!u || !u.pub || !wrap) return;
  const n = u.players.length;
  const box = document.getElementById('holdemStage');
  const w = box.clientWidth, h = box.clientHeight;
  u.players.forEach((_, i) => {
    const el = wrap.children[i];
    if (!el) return;
    const k = (i - Math.max(0, u.seat) + n) % n;
    const p = heSeatPos(k, n);
    if (HE.stage) {
      const v = new THREE.Vector3(p.x * 1.08, 0.3, p.z * 1.12).project(HE.stage.camera);
      el.style.left = ((v.x + 1) / 2) * w + 'px';
      el.style.top = ((1 - v.y) / 2) * h + 'px';
    } else {
      el.style.left = (50 + (p.x / 5) * 46) + '%';
      el.style.top = (50 + (p.z / 2.9) * 42) + '%';
    }
  });
}

function holdemRender(u, t) {
  const { pub, priv, seat, players } = u;
  const n = players.length;
  if (!HE.stage && !HE.fallback) initHoldem3d();
  // Місця
  const wrap = document.getElementById('holdemSeats');
  if (wrap) {
    const html = players.map((name, i) => {
      const isTurn = pub.turn === i && pub.phase === 'bet';
      const st = pub.out[i] ? 'вийшов' : pub.folded && pub.folded[i] && pub.inHand[i] ? 'фолд' : pub.inHand && pub.inHand[i] && pub.stacks[i] === 0 && pub.phase === 'bet' ? 'олин' : '';
      const sd = pub.showdown && pub.showdown[i];
      const won = pub.won && pub.won[i] > 0 ? `+${pub.won[i]}` : '';
      return `<div class="he-seat${i === seat ? ' is-me' : ''}${isTurn ? ' is-turn' : ''}${pub.out[i] || (pub.folded && pub.folded[i]) ? ' is-out' : ''}${won ? ' is-won' : ''}">
        <b>${escapeHtml(name)}${i === pub.dealer ? ' <span class="he-d">D</span>' : ''}</b>
        <span class="num">${formatNumber(pub.stacks[i])}</span>
        ${pub.bet && pub.bet[i] ? `<span class="he-bet num">${pub.bet[i]}</span>` : ''}
        ${st ? `<small>${st}</small>` : ''}${sd ? `<small class="he-sd">${sd.name}</small>` : ''}${won ? `<small class="he-won num">${won}</small>` : ''}
      </div>`;
    }).join('');
    if (wrap.dataset.html !== html) { wrap.dataset.html = html; wrap.innerHTML = html; }
    heLabels();
  }
  // Сцена
  if (HE.stage) {
    const T = THREE;
    // Нова роздача — карти летять від дилера
    while (HE.holes.length < n) { const pair = [heCardMesh(T), heCardMesh(T)]; pair.forEach((m) => { m.visible = false; HE.stage.scene.add(m); }); HE.holes.push(pair); }
    const newHand = pub.hand !== HE.lastHand;
    HE.lastHand = pub.hand;
    players.forEach((_, i) => {
      const k = (i - Math.max(0, seat) + n) % n, p = heSeatPos(k, n);
      const inHand = pub.inHand && pub.inHand[i] && !(pub.folded && pub.folded[i]);
      HE.holes[i].forEach((m, j) => {
        const card = i === seat && priv && priv.hole ? priv.hole[j] : pub.showdown && pub.showdown[i] ? pub.showdown[i].cards[j] : null;
        heSetCard(m, card);
        // Мої й відкриті на шоудауні — лицем догори; решта — сорочкою
        m.rotation.x = card ? 0 : Math.PI;
        const target = { x: p.x * 0.66 + (j ? 0.34 : -0.34), y: 0.13 + j * 0.01, z: p.z * 0.62, r: (j ? -0.12 : 0.12), arc: 1 };
        if (newHand && inHand) { m.visible = true; m.position.set(0, 1.5, -1.6); heTween(m, target, 450 + i * 90 + j * 60); }
        else if (!inHand && m.visible && !m.userData.tween) { heTween(m, { x: 0, y: 0.13, z: -1.2, r: 0, arc: 0.4 }, 400); setTimeout(() => { m.visible = false; }, 420); }
        else if (inHand && !m.visible) { m.visible = true; m.position.set(target.x, target.y, target.z); }
      });
    });
    // Борд
    HE.board.forEach((m, i) => {
      const c = pub.board[i];
      if (c && !m.visible) {
        heSetCard(m, c); m.visible = true; m.rotation.x = Math.PI; m.position.set(0, 1.4, -1.6);
        heTween(m, { x: -1.4 + i * 0.7, y: 0.13, z: -0.2, r: 0, arc: 0.6 }, 420 + i * 80);
        const t0 = performance.now();
        const flip = (now) => { const k = Math.min(1, (now - t0) / 520); m.rotation.x = Math.PI * (1 - g3dEaseOut(k)); if (k >= 1) HE.stage.tickers.delete(flip); };
        HE.stage.tickers.add(flip);
      } else if (!c && m.visible) m.visible = false;
    });
    // Банк і кнопка дилера
    HE.pot.clear();
    heChipStack(HE.pot, pub.pot, 0, 0);
    players.forEach((_, i) => { if (pub.bet && pub.bet[i]) { const k = (i - Math.max(0, seat) + n) % n, p = heSeatPos(k, n); heChipStack(HE.pot, pub.bet[i], p.x * 0.45, p.z * 0.45 - 0.75); } });
    const dk = (pub.dealer - Math.max(0, seat) + n) % n, dp = heSeatPos(dk, n);
    HE.button.position.set(dp.x * 0.55 + 0.45, 0.13, dp.z * 0.55);
  } else if (HE.fallback) {
    const flat = document.getElementById('holdemFlat');
    if (flat) flat.innerHTML = `<div class="he-board">${[0, 1, 2, 3, 4].map((i) => cardHtmlP(pub.board[i] || null)).join('')}</div><div class="he-pot num">Банк ${formatNumber(pub.pot)}</div>`;
  }
  // Мої карти й керування
  const mine = document.getElementById('holdemHole');
  if (mine) mine.innerHTML = priv && priv.hole ? priv.hole.map((c) => cardHtmlP(c)).join('') : '';
  const info = document.getElementById('holdemInfo');
  if (info) info.innerHTML = `Роздача <b class="num">${pub.hand}</b>/${pub.maxHands} · сліпі <b class="num">${pub.blinds ? pub.blinds.join('/') : ''}</b> · банк <b class="num">${formatNumber(pub.pot)}</b>`;
  const myTurn = pub.phase === 'bet' && pub.turn === seat && !pub.over;
  const ctr = document.getElementById('holdemCtrl');
  if (ctr) {
    ctr.classList.toggle('is-off', !myTurn);
    const need = pub.toCall - (pub.bet[seat] || 0);
    const max = (pub.bet[seat] || 0) + (pub.stacks[seat] || 0);
    const minTo = Math.min(max, pub.toCall + pub.minRaise);
    const slider = document.getElementById('holdemRaise');
    if (slider) {
      slider.min = minTo; slider.max = max; slider.step = Math.max(1, pub.blinds ? pub.blinds[0] : 5);
      if (+slider.value < minTo || +slider.value > max || t.local.hand !== pub.hand + ':' + pub.street) { slider.value = minTo; t.local.hand = pub.hand + ':' + pub.street; }
    }
    const lbl = document.getElementById('holdemRaiseVal'); if (lbl && slider) lbl.textContent = formatNumber(+slider.value);
    const rb = document.getElementById('holdemRaiseBtn');
    if (rb && rb.firstChild && rb.firstChild.nodeType === 3) rb.firstChild.textContent = pub.toCall > 0 ? 'Рейз до ' : 'Бет ';
    const callBtn = document.getElementById('holdemCall');
    if (callBtn) callBtn.innerHTML = need > 0 ? `Колл <b class="num">${formatNumber(Math.min(need, pub.stacks[seat]))}</b>` : 'Чек';
    document.getElementById('holdemFold')?.toggleAttribute('disabled', !myTurn);
    callBtn?.toggleAttribute('disabled', !myTurn);
    document.getElementById('holdemRaiseBtn')?.toggleAttribute('disabled', !myTurn || max <= pub.toCall);
  }
  const st = document.getElementById('holdemStatus');
  if (st && !pub.over) {
    const l = pub.last;
    const names = { fold: 'фолд', check: 'чек', call: 'колл', raise: 'рейз до', allin: 'олин' };
    st.innerHTML = pub.phase === 'show'
      ? (pub.won ? pub.won.map((w, i) => (w > 0 ? `${escapeHtml(players[i])} забирає ${formatNumber(w)}${pub.showdown && pub.showdown[i] ? ' — ' + pub.showdown[i].name : ''}` : '')).filter(Boolean).join(' · ') : '')
      : (myTurn ? '<b>Твій хід.</b> ' : `Ходить ${escapeHtml(players[pub.turn] || '')}. `) + (l && l.a ? `${escapeHtml(players[l.seat])}: ${names[l.a]}${l.a === 'raise' || l.a === 'call' ? ' ' + l.amount : ''}` : '');
  }
  if (myTurn && t.local.turnPing !== pub.until) { t.local.turnPing = pub.until; navigator.vibrate && navigator.vibrate(30); }
}
function holdemCall() {
  const u = TBL.holdem && TBL.holdem.last; if (!u) return;
  const need = u.pub.toCall - (u.pub.bet[u.seat] || 0);
  tableAct('holdem', { a: need > 0 ? 'call' : 'check' });
}
function holdemRaise() {
  const u = TBL.holdem && TBL.holdem.last; if (!u) return;
  const to = +document.getElementById('holdemRaise').value;
  const max = (u.pub.bet[u.seat] || 0) + (u.pub.stacks[u.seat] || 0);
  tableAct('holdem', to >= max ? { a: 'allin' } : { a: 'raise', to });
}
function holdemPreset(kind) {
  const u = TBL.holdem && TBL.holdem.last; if (!u) return;
  const s = document.getElementById('holdemRaise');
  const max = (u.pub.bet[u.seat] || 0) + (u.pub.stacks[u.seat] || 0);
  const v = kind === 'max' ? max : u.pub.toCall + Math.round(u.pub.pot * (kind === 'half' ? 0.5 : 1));
  s.value = Math.max(+s.min, Math.min(max, v));
  document.getElementById('holdemRaiseVal').textContent = formatNumber(+s.value);
}
function initHoldem() { initTable('holdem'); initHoldem3d(); }
try { new MutationObserver(() => setTimeout(heApplyTheme, 50)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] }); } catch (e) { /* старі браузери */ }
