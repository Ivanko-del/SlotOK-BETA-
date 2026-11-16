// ============================================================
// 3D-ЕФЕКТИ «лише картинка»: кубик Dice і монета Coinflip.
// Результат уже відомий (його повернув сервер) — тут він лише показується:
// ні логіки, ні таймерів гри, ні викликів сервера. Рух — transform (WAAPI),
// без нескінченних анімацій; при prefers-reduced-motion кубик одразу
// лягає потрібною гранню.
// ============================================================
function flip3dReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

// Кубик Dice: передня грань показує випале число (1–99), кубик докочується до неї за ~0,55 с
function dice3dRoll(result, win) {
  const stage = document.getElementById('dice3d');
  const cube = stage && stage.querySelector('.d3-cube');
  if (!cube) return;
  const front = cube.querySelector('.d3-front');
  if (front) front.textContent = String(result);
  cube.classList.remove('is-win', 'is-lose');
  if (cube._anim) { cube._anim.cancel(); cube._anim = null; }
  const done = () => cube.classList.add(win ? 'is-win' : 'is-lose');
  if (flip3dReduced() || !cube.animate) { done(); return; }
  const fx = 360 * (1 + Math.floor(Math.random() * 2)), fy = 360 * (1 + Math.floor(Math.random() * 2));
  cube._anim = cube.animate([
    { transform: `translateY(0) rotateX(${-fx - 90}deg) rotateY(${fy + 90}deg)` },
    { transform: 'translateY(-26px) rotateX(-180deg) rotateY(180deg)', offset: 0.45 },
    { transform: 'translateY(0) rotateX(0deg) rotateY(0deg)' },
  ], { duration: 560, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'none' });
  cube._anim.onfinish = () => { cube._anim = null; done(); };
  cube._anim.oncancel = () => { cube._anim = null; };
}

// Монета Coinflip: HTML 3D-монети; після рендера крутиться й лягає на потрібний бік
function cf3dCoin(result) {
  const tails = result !== 'heads';
  return `<div class="cf3d-stage" aria-label="${tails ? 'Решка' : 'Орел'}"><div class="cf3d-coin${tails ? ' is-tails' : ''}">
    <span class="cf3d-face cf3d-heads"><span class="ic i-crown" aria-hidden="true"></span></span>
    <span class="cf3d-face cf3d-tails"><span class="ic i-diamond" aria-hidden="true"></span></span>
    <span class="cf3d-rim"></span></div></div>`;
}
