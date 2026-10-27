// ══════════════════════════════════════════════════════
// 🎟️ LOTTERY SYSTEM
// ══════════════════════════════════════════════════════
function loadLottery() {
  const ticketPrice=100;
  // Get or init current week pool
  const weekKey = getWeekStr();
  db.ref('lottery/'+weekKey).once('value', snap => {
    const data=snap.val()||{pool:0,tickets:{}};
    document.getElementById('lotteryPrizeDisplay').textContent='₴'+formatNumber(data.pool||0);
    // My tickets
    const mine=Object.entries(data.tickets||{}).filter(([_,t])=>t.user===currentUser);
    const myEl=document.getElementById('lotteryMyTickets');
    if(myEl) myEl.innerHTML=mine.length?mine.map(([id,t])=>`<div class="box" style="padding:10px;margin-bottom:6px;display:flex;justify-content:space-between;"><span>🎟️ Квиток #${id.slice(-4).toUpperCase()}</span><span style="color:var(--fg-4);font-size:12px;">${new Date(t.ts).toLocaleDateString('uk-UA')}</span></div>`).join(''):
      '<div style="color:var(--fg-4);text-align:center;padding:14px;">Ви ще не купили квитків</div>';
    // Countdown to Sunday 20:00
    const now=new Date(), next=new Date(); next.setDate(now.getDate()+(7-now.getDay())%7||7); next.setHours(20,0,0,0);
    document.getElementById('lotteryCountdown').textContent=next.toLocaleDateString('uk-UA')+' о 20:00';
  });
  // History
  db.ref('lottery_history').limitToLast(5).once('value',snap=>{
    const el=document.getElementById('lotteryHistory');
    if(!el) return;
    const d=snap.val();
    if(!d){el.innerHTML='<div style="color:var(--fg-4);text-align:center;padding:14px;">Ще не було розіграшів</div>';return;}
    el.innerHTML=Object.values(d).reverse().map(h=>`<div class="box" style="padding:10px;margin-bottom:6px;"><div style="font-weight:bold;color:var(--accent);">👑 ${h.winner}</div><div style="font-size:12px;color:var(--fg-4);">+₴${formatNumber(h.prize)} • ${new Date(h.ts).toLocaleDateString('uk-UA')}</div></div>`).join('');
  });
}
function buyLotteryTickets() {
  const count=parseInt(document.getElementById('lotteryTickets').value)||1;
  const cost=count*100;
  if(!validateBet(cost)) return;
  const weekKey=getWeekStr();
  const updates={};
  for(let i=0;i<count;i++) {
    const tid=db.ref().push().key;
    updates[`lottery/${weekKey}/tickets/${tid}`]={user:currentUser,ts:Date.now()};
  }
  updates[`lottery/${weekKey}/pool`]=firebase.database.ServerValue.increment(cost*0.8); // 80% to pool
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-cost));
  userData.balance-=cost; updateUI();
  db.ref().update(updates).then(()=>{
    notify(`🎟️ Куплено ${count} квитків за ₴${formatNumber(cost)}!`,'success');
    loadLottery();
    checkAchievements('lottery',null);
  });
}

// ══════════════════════════════════════════════════════
// 📈 INVEST POOL
// ══════════════════════════════════════════════════════
function loadInvestPool() {
  db.ref('investPool').once('value', snap=>{
    const pool=snap.val()||{total:0,investors:{}};
    const myShare=pool.investors?.[currentUser]?.amount||0;
    const total=pool.total||0;
    document.getElementById('investMyShare').textContent='₴'+formatNumber(myShare);
    document.getElementById('investTotalPool').textContent='₴'+formatNumber(total);
    document.getElementById('investMyPercent').textContent=total>0?((myShare/total)*100).toFixed(1)+'%':'0%';
  });
}
function investInPool() {
  const amt=parseInt(document.getElementById('investAmount').value)||0;
  if(!validateBet(amt)) return;
  const updates={};
  updates['investPool/total']=firebase.database.ServerValue.increment(amt);
  updates['investPool/investors/'+currentUser+'/amount']=firebase.database.ServerValue.increment(amt);
  updates['investPool/investors/'+currentUser+'/ts']=Date.now();
  updates['users/'+currentUser+'/balance']=firebase.database.ServerValue.increment(-amt);
  userData.balance-=amt; updateUI();
  db.ref().update(updates).then(()=>{notify('📈 Вкладено в пул!','success');loadInvestPool();});
}
function withdrawFromPool() {
  const amt=parseInt(document.getElementById('withdrawInvest').value)||0;
  db.ref('investPool/investors/'+currentUser+'/amount').once('value',snap=>{
    const myAmt=snap.val()||0;
    if(amt>myAmt) return notify('Недостатньо коштів у пулі','error');
    const upd={};
    upd['investPool/total']=firebase.database.ServerValue.increment(-amt);
    upd['investPool/investors/'+currentUser+'/amount']=firebase.database.ServerValue.increment(-amt);
    upd['users/'+currentUser+'/balance']=firebase.database.ServerValue.increment(amt);
    userData.balance+=amt; updateUI();
    db.ref().update(upd).then(()=>{notify('💸 Виведено з пулу!','success');loadInvestPool();});
  });
}

// ══════════════════════════════════════════════════════
// 🎡 DAILY SPIN
// ══════════════════════════════════════════════════════
const DAILY_SPIN_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#d4af37'];
let dailySpinCanvas=null, dailySpinCtx=null, dailySpinAngle=0;
function openDailySpinModal() {
  openTabModal('dailySpinModal');
  const today=getTodayStr();
  const spun=userData.dailySpinDate===today;
  const btn=document.getElementById('dailySpinBtn');
  const status=document.getElementById('dailySpinStatus');
  if(spun) { btn.disabled=true; status.textContent='Вже крутили сьогодні. Повертайтеся завтра!'; }
  else { btn.disabled=false; status.textContent='Безкоштовно раз на день'; }
  drawDailySpin(dailySpinAngle);
}
function drawDailySpin(angle) {
  const canvas=document.getElementById('dailySpinCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const cx=130,cy=130,r=120,n=DAILY_SPIN_PRIZES.length;
  ctx.clearRect(0,0,260,260);
  for(let i=0;i<n;i++) {
    const start=angle+i*(2*Math.PI/n), end=start+2*Math.PI/n;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end); ctx.closePath();
    ctx.fillStyle=DAILY_SPIN_COLORS[i]; ctx.fill();
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(start+(end-start)/2);
    ctx.textAlign='right'; ctx.fillStyle='#fff'; ctx.font='bold 11px Orbitron,sans-serif';
    ctx.fillText('₴'+DAILY_SPIN_PRIZES[i],r-8,4); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx,cy,18,0,2*Math.PI); ctx.fillStyle='#111'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,14,0,2*Math.PI); ctx.fillStyle='#d4af37'; ctx.fill();
}
async function doSpinDaily() {
  const today=getTodayStr();
  if(userData.dailySpinDate===today) return notify('Вже крутили сьогодні!','error');
  const btn=document.getElementById('dailySpinBtn');
  if(btn.disabled) return;
  btn.disabled=true;
  // Сектор вибирає сервер; колесо лише докручується до нього.
  const srv = await serverReward('dailySpin');
  if(srv.mode === 'error') { if(srv.status !== 409) btn.disabled=false; return; }
  const server = srv.mode === 'server';
  const targetIdx = server ? srv.r.index : Math.floor(Math.random()*DAILY_SPIN_PRIZES.length);
  const prize=DAILY_SPIN_PRIZES[targetIdx];
  const targetAngle=-(2*Math.PI/DAILY_SPIN_PRIZES.length)*targetIdx + Math.PI*1.5;
  const totalSpin=targetAngle+Math.PI*8;
  let current=dailySpinAngle, speed=0.3, target=current+totalSpin;
  const anim=()=>{
    current+=speed; speed=Math.max(0.01,(target-current)*0.04+0.01);
    drawDailySpin(current);
    if(current<target) requestAnimationFrame(anim);
    else {
      dailySpinAngle=current;
      document.getElementById('dailySpinResult').textContent='🎉 +₴'+formatNumber(prize)+'!';
      document.getElementById('dailySpinResult').style.color='var(--accent)';
      document.getElementById('dailySpinStatus').textContent='Приходь завтра!';
      if(!server) {
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(prize));
        db.ref('users/'+currentUser+'/dailySpinDate').set(today);
        userData.balance+=prize; userData.dailySpinDate=today; updateUI();
      }
      notify('🎡 Щоденний спін: +₴'+formatNumber(prize),'success');
      checkAchievements('spin',prize);
    }
  };
  anim();
}

// ══════════════════════════════════════════════════════
// 📣 SHARE WIN
// ══════════════════════════════════════════════════════
let pendingShare={amount:0,game:'',mult:0};
function openShareWin(amount,game,mult) {
  pendingShare={amount,game,mult};
  document.getElementById('shareWinAmount').textContent='₴'+formatNumber(amount);
  document.getElementById('shareWinGame').textContent=game+(mult?' • x'+mult:'');
  document.getElementById('shareWinUser').textContent=currentUser||'Гравець';
  openTabModal('shareWinModal');
}
function generateShareImage() {
  const canvas=document.getElementById('shareCanvas');
  const ctx=canvas.getContext('2d');
  canvas.width=400; canvas.height=220;
  const grad=ctx.createLinearGradient(0,0,400,220);
  grad.addColorStop(0,'#1a0500'); grad.addColorStop(1,'#2d0800');
  ctx.fillStyle=grad; ctx.fillRect(0,0,400,220);
  ctx.strokeStyle='#d4af37'; ctx.lineWidth=3;
  ctx.strokeRect(3,3,394,214);
  ctx.fillStyle='#d4af37'; ctx.font='bold 32px Orbitron,sans-serif';
  ctx.textAlign='center'; ctx.fillText('SLOTOK',200,50);
  ctx.fillStyle='#fff'; ctx.font='bold 42px Orbitron,sans-serif';
  ctx.fillText('₴'+formatNumber(pendingShare.amount),200,120);
  ctx.fillStyle='#aaa'; ctx.font='14px Arial,sans-serif';
  ctx.fillText(pendingShare.game,200,155);
  ctx.fillStyle='#555'; ctx.font='12px Arial,sans-serif';
  ctx.fillText('@'+currentUser+' • slotok.app',200,190);
  canvas.style.display='block';
  const link=document.createElement('a'); link.download='slotok_win.png';
  link.href=canvas.toDataURL(); link.click();
  canvas.style.display='none';
}
function shareToTelegram() {
  const text=`🎰 Виграв ₴${formatNumber(pendingShare.amount)} в ${pendingShare.game} на @SlotOKBot! Грай зі мною: https://t.me/SlotOK_DepositBot`;
  window.open('https://t.me/share/url?url=https://t.me/SlotOK_DepositBot&text='+encodeURIComponent(text),'_blank');
}

// ══════════════════════════════════════════════════════
// 📆 EVENT CALENDAR
// ══════════════════════════════════════════════════════
const SCHEDULED_EVENTS = [
  { day:0, hour:20, icon:'🎟️', name:'Лотерея', desc:'Щотижневий розіграш призового фонду', color:'#d4af37' },
  { day:3, hour:18, icon:'🏆', name:'Середній турнір', desc:'PvP турнір з призами 5000₴', color:'#4a9eff' },
  { day:5, hour:20, icon:'🎊', name:'Бонусні вихідні', desc:'Всі виграші x2 до неділі 23:59', color:'#3dd68c' },
  { day:6, hour:14, icon:'👑', name:'VIP-стрим', desc:'Ексклюзивна гра для VIP+ гравців', color:'#c9a0ff' },
];
function openEventCalendar() { openTabModal('eventCalendarModal'); renderEventCalendar(); }
function renderEventCalendar() {
  const el=document.getElementById('eventCalendarFull');
  if(!el) return;
  const now=new Date(), dow=now.getDay();
  el.innerHTML=SCHEDULED_EVENTS.map(e=>{
    const daysUntil=(e.day-dow+7)%7||7;
    const dateLabel=daysUntil===1?'Завтра':daysUntil<7?`Через ${daysUntil} дні`:'Цього тижня';
    return `<div style="background:var(--box);border:1px solid ${e.color}44;border-left:4px solid ${e.color};border-radius:var(--r-lg);padding:14px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:24px;">${e.icon}</span>
        <div><div style="font-weight:bold;color:${e.color};">${e.name}</div><div style="font-size:12px;color:var(--fg-4);">${dateLabel} о ${e.hour}:00</div></div>
      </div>
      <div style="font-size:13px;color:var(--fg-2);">${e.desc}</div>
    </div>`;
  }).join('');
}
function initEventCalendarMini() {
  const el=document.getElementById('eventCalendarMini');
  const labelEl=document.getElementById('nextEventLabel');
  if(!el) return;
  const now=new Date(), dow=now.getDay();
  const next=SCHEDULED_EVENTS.map(e=>({...e,days:(e.day-dow+7)%7||7})).sort((a,b)=>a.days-b.days)[0];
  if(next && labelEl) labelEl.textContent=next.icon+' '+next.name+' — через '+next.days+'д';
  el.innerHTML=SCHEDULED_EVENTS.slice(0,4).map(e=>`<div style="background:${e.color}22;border:1px solid ${e.color}55;border-radius:var(--r-md);padding:8px 10px;white-space:nowrap;flex-shrink:0;"><div style="font-size:16px;">${e.icon}</div><div style="font-size:10px;color:${e.color};font-weight:bold;">${e.name}</div></div>`).join('');
}

// ══════════════════════════════════════════════════════
// 🎰 PROGRESSIVE JACKPOT
// ══════════════════════════════════════════════════════
function initProgressiveJackpot() {
  db.ref('jackpot/amount').on('value', snap=>{
    const amt=snap.val()||50000;
    const el=document.getElementById('jackpotDisplay');
    if(el) el.textContent='₴'+formatNumber(Math.floor(amt));
  });
}
// Add 0.1% of each wager to jackpot (patch into addWager)
const _origAddWager=window.addWager;
if(typeof addWager==='function') {
  window.addWager=function(amt){
    _origAddWager && _origAddWager(amt);
    db.ref('jackpot/amount').set(firebase.database.ServerValue.increment(Math.floor(amt*0.001)));
  };
}

// ══════════════════════════════════════════════════════
// 🎨 ACCENT COLOR SYSTEM
// ══════════════════════════════════════════════════════
// Готові акценти — колишні кольорові теми. Значення для кожної теми живуть
// у CSS (html[data-accent]), тут — лише назви й колір для зразка.
const ACCENT_PRESETS = {
  coral:  { label: 'Помаранч', dark: '#FF7A3D' },
  blue:   { label: 'Синя',     dark: '#6FA8FF' },
  neon:   { label: 'Неон',     dark: '#C38BFF' },
  matrix: { label: 'Матриця',  dark: '#6BEA8C' },
  sakura: { label: 'Сакура',   dark: '#FF8CC6' },
};
// Старі збережені hex-акценти → пресети
const LEGACY_ACCENT_HEX = { '#d4af37': 'coral', '#ff9f43': 'coral', '#c9a0ff': 'neon', '#4a9eff': 'blue', '#00e5ff': 'blue', '#3dd68c': 'matrix', '#ff6b6b': 'sakura', '#ff4081': 'sakura' };

function currentAccentName() {
  const v = localStorage.getItem('slotok_accent') || 'coral';
  return ACCENT_PRESETS[v] ? v : (LEGACY_ACCENT_HEX[v.toLowerCase()] || 'custom');
}

function hexToRgbChannels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// value — назва пресету ('coral', 'blue', …) або будь-який #rrggbb з піпетки.
function setAccentColor(value, el, silent) {
  if(!value) return;
  const root = document.documentElement;
  let name = ACCENT_PRESETS[value] ? value : LEGACY_ACCENT_HEX[String(value).toLowerCase()];
  ['--accent', '--accent-rgb', '--on-accent'].forEach((v) => root.style.removeProperty(v));
  if (name) {
    if (name === 'coral') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', name);
    localStorage.setItem('slotok_accent', name);
  } else {
    const rgb = hexToRgbChannels(value);
    if (!rgb) return;
    root.removeAttribute('data-accent');
    root.style.setProperty('--accent', value);
    root.style.setProperty('--accent-rgb', rgb.join(' '));
    // Текст на акценті: темний на світлому кольорі, білий на темному
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    root.style.setProperty('--on-accent', lum > 0.55 ? '#1A0E08' : '#FFFFFF');
    localStorage.setItem('slotok_accent', value);
    name = 'custom';
  }
  document.querySelectorAll('[data-accent-option]').forEach((d) => {
    const on = d.getAttribute('data-accent-option') === name;
    d.classList.toggle('active', on);
    d.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  const pick = document.getElementById('accentColorCustom');
  if (pick && name === 'custom') pick.value = value;
  if (!silent && el !== null && typeof notify === 'function' && el) notify('Акцент змінено', 'info');
}
function loadAccentColor() {
  setAccentColor(localStorage.getItem('slotok_accent') || 'coral', null, true);
  loadSavedBackground();
}

// ─── BACKGROUND ───
// Фонові відтінки — на токенах, тож однаково працюють у темній і світлій темі.
var BG_PRESETS = {
  dark:    '',
  navy:    'linear-gradient(160deg, var(--bg), color-mix(in srgb, var(--info) 14%, var(--bg)))',
  forest:  'linear-gradient(160deg, var(--bg), color-mix(in srgb, var(--pos) 12%, var(--bg)))',
  crimson: 'linear-gradient(160deg, var(--bg), color-mix(in srgb, var(--neg) 12%, var(--bg)))',
  purple:  'linear-gradient(160deg, var(--bg), color-mix(in srgb, var(--special) 14%, var(--bg)))',
  ocean:   'linear-gradient(160deg, var(--bg), color-mix(in srgb, var(--primary) 12%, var(--bg)))',
  sunset:  'linear-gradient(160deg, var(--bg), color-mix(in srgb, var(--accent) 12%, var(--bg)))'
};
// Раніше зберігали сам рядок градієнта — впізнаємо старі значення за кольором.
var LEGACY_BG = { '#050505':'dark', '#0a0a2e':'navy', '#0a1a0a':'forest', '#2a0808':'crimson', '#1a0530':'purple', '#051a2e':'ocean', '#2d1500':'sunset' };
function bgPresetKey(v) {
  if (BG_PRESETS[v] !== undefined) return v;
  for (var hex in LEGACY_BG) if (String(v).indexOf(hex) !== -1) return LEGACY_BG[hex];
  return null;
}
function setBgPreset(key, el) {
  document.querySelectorAll('.bg-preset').forEach(function(d){ d.classList.remove('active'); d.setAttribute('aria-pressed','false'); });
  if(el) { el.classList.add('active'); el.setAttribute('aria-pressed','true'); }
  if (BG_PRESETS[key] === undefined) key = 'dark';
  applyBackground(BG_PRESETS[key]);
  localStorage.setItem('slotok_bg_type','preset');
  localStorage.setItem('slotok_bg_value', key);
}
function setBgCustomColor(hex) {
  applyBackground(hex);
  localStorage.setItem('slotok_bg_type','color');
  localStorage.setItem('slotok_bg_value', hex);
}
function applyBackground(bg) {
  document.body.style.backgroundImage = '';
  document.body.style.background = bg;
}
function setBgPhoto(input) {
  var file = input.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var url = e.target.result;
    document.body.style.background = 'url('+url+') center/cover fixed';
    try{ localStorage.setItem('slotok_bg_type','photo'); localStorage.setItem('slotok_bg_photo', url); }catch(ex) { console.warn(ex); }
    var preview = document.getElementById('bgPhotoPreview');
    var img = document.getElementById('bgPhotoImg');
    if(preview) preview.style.display = 'block';
    if(img) img.src = url;
  };
  reader.readAsDataURL(file);
}
function removeBgPhoto() {
  document.body.style.background = '';
  localStorage.removeItem('slotok_bg_type');
  localStorage.removeItem('slotok_bg_photo');
  var preview = document.getElementById('bgPhotoPreview');
  if(preview) preview.style.display = 'none';
  var input = document.getElementById('bgPhotoInput');
  if(input) input.value = '';
}
function loadSavedBackground() {
  var type  = localStorage.getItem('slotok_bg_type');
  var value = localStorage.getItem('slotok_bg_value');
  if(type === 'photo') {
    var photo = localStorage.getItem('slotok_bg_photo');
    if(photo) {
      document.body.style.background = 'url('+photo+') center/cover fixed';
      var preview = document.getElementById('bgPhotoPreview');
      var img = document.getElementById('bgPhotoImg');
      if(preview) preview.style.display='block';
      if(img) img.src = photo;
    }
  } else if(type === 'preset' && value) {
    var key = bgPresetKey(value);
    if (key) applyBackground(BG_PRESETS[key]);
  } else if(value) {
    applyBackground(value);
  }
}
function toggleStreamerMode(on) {
  saveSetting('streamer',on);
  document.querySelectorAll('.bal').forEach(el=>el.textContent=on?'***':formatNumber(userData?.balance||0));
  document.querySelectorAll('#profileName,#profileId').forEach(el=>{ if(on && !el._orig) { el._orig=el.textContent; el.textContent='***'; } else if(!on && el._orig) { el.textContent=el._orig; el._orig=null; }});
  notify(on?'📺 Режим стримера увімкнено (баланс прихований)':'📺 Режим стримера вимкнено','info');
}
function toggleFocusMode(on) {
  saveSetting('focus',on);
  const toHide=['#jackpotTicker','.home-tabs','.wins-feed','.providers-scroll','#hp-chat'];
  toHide.forEach(sel=>document.querySelectorAll(sel).forEach(el=>el.style.display=on?'none':''));
  notify(on?'🎯 Режим фокусу увімкнено':'🎯 Режим фокусу вимкнено','info');
}

// ══════════════════════════════════════════════════════
// 🌅 DYNAMIC BACKGROUND
// ══════════════════════════════════════════════════════
function applyDynamicBg(on) {
  if(!on) { document.body.style.background=''; return; }
  const h=new Date().getHours();
  let bg='';
  if(h>=5&&h<9)   bg='linear-gradient(180deg,#1a0a00 0%,#050505 100%)'; // Ранок
  else if(h>=9&&h<17)  bg='linear-gradient(180deg,#050510 0%,#050505 100%)'; // День
  else if(h>=17&&h<21) bg='linear-gradient(180deg,#1a0505 0%,#050505 100%)'; // Вечір
  else               bg='linear-gradient(180deg,#000005 0%,#050505 100%)'; // Ніч
  document.body.style.background=bg;
}

// ══════════════════════════════════════════════════════
// 📊 MINI BALANCE CHART
// ══════════════════════════════════════════════════════
function renderMiniBalanceChart() {
  const canvas=document.getElementById('miniBalanceChart');
  if(!canvas) return;
  // Read last 30 games from history
  db.ref('users/'+currentUser+'/balanceHistory').limitToLast(30).once('value',snap=>{
    const data=snap.val()?Object.values(snap.val()):[userData?.balance||1000];
    const ctx=canvas.getContext('2d');
    const w=canvas.offsetWidth||300, h=50;
    canvas.width=w; canvas.height=h;
    const min=Math.min(...data), max=Math.max(...data), range=max-min||1;
    ctx.clearRect(0,0,w,h);
    ctx.beginPath();
    data.forEach((v,i)=>{ const x=i/(data.length-1||1)*w; const y=h-(v-min)/range*(h-4)-2; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle='#d4af37'; ctx.lineWidth=2; ctx.stroke();
    const grad=ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0,'rgba(212,175,55,.3)'); grad.addColorStop(1,'transparent');
    ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.fillStyle=grad; ctx.fill();
  });
}

// ══════════════════════════════════════════════════════
// ADD GAME HELP ENTRIES FOR NEW GAMES
// ══════════════════════════════════════════════════════
Object.assign(GAME_HELP, {
  dragon: { title:'🐉 Dragon Tower', rules:`<b>Мета:</b> Піднімайся по вежі — кожен рівень безпечно пройдений = більший множник.<br><br><b>Як грати:</b><br>1. Вибери складність: скільки драконів на ряд<br>2. Натискай на яйця — якщо не потрапив на дракона, множник зростає<br>3. Натисни "Забрати" в будь-який момент<br><br><b>Складність:</b><br>Легка (1/3) → Mid → Хардкор (3/4)<br>8 рівнів всього, пройди всі = AUTO кешаут` },
  sicbo: { title:'🎲 Sic Bo', rules:`<b>Мета:</b> Поставити на результат трьох кубиків.<br><br><b>Ставки:</b><br>📈 Велике (11-17) → x2<br>📉 Мале (4-10) → x2<br>🎰 Трипл → x24<br>🔢 Точна сума → x6-x60<br><br><b>Увага:</b> Трипл скасовує Велике/Мале!` },
  cardwar: { title:'⚔️ Card War', rules:`<b>Мета:</b> Твоя карта проти карти дилера — вища виграє.<br><br><b>Виплати:</b><br>Твоя > Дилер → x2<br>Нічия → повернення ставки<br>Твоя < Дилер → програш<br><br><b>Ранги:</b> 2(низька) ... A(висока)` },
});

// ══════════════════════════════════════════════════════
// INIT CALLS ON LOAD
// ══════════════════════════════════════════════════════
function initV62Features() {
  loadAccentColor();
  applyDynamicBg(true);
  setTimeout(initProgressiveJackpot, 1200);
  setTimeout(initEventCalendarMini, 1500);
  setTimeout(renderMiniBalanceChart, 2000);
}

// ── PM BADGE watcher ──
function watchSupportUnread() {
  if(!currentUser) return;
  db.ref('users/'+currentUser+'/supportUnread').on('value', snap => {
    const count = snap.val() || 0;
    const badge = document.getElementById('supportUnreadBadge');
    if(badge) {
      badge.textContent = count > 0 ? count : '';
      badge.classList.toggle('hidden', count === 0);
    }
  });
}

function watchPmUnread() {
  if(!currentUser) return;
  db.ref('users/'+currentUser+'/pmUnread').on('value', snap => {
    const count = snap.val() || 0;
    const badge = document.getElementById('pmBadge');
    if(badge) {
      badge.textContent = count > 0 ? count : '!';
      badge.classList.toggle('hidden', count === 0);
    }
  });
}


