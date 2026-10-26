// ============================================================
// ===== СПОРТ V2 — ESPN PUBLIC API (без ключа) =====
// ============================================================
let realMatches       = {};
let liveTrackerTimer  = null;
let activeLiveMatchId = null;
let sportsCurrentSport = 'soccer';
let currentBetSlip    = null;

const SPORT_META = {
  soccer:     { icon:'⚽', name:'Футбол',    espnUrl:'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', league:'Premier League' },
  ucl:        { icon:'🏆', name:'UCL',       espnUrl:'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard', league:'Champions League' },
  laliga:     { icon:'🇪🇸', name:'La Liga',  espnUrl:'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard', league:'La Liga' },
  bundesliga: { icon:'🇩🇪', name:'Бундесліга',espnUrl:'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard', league:'Bundesliga' },
  basketball: { icon:'🏀', name:'NBA',        espnUrl:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', league:'NBA' },
  hockey:     { icon:'🏒', name:'NHL',        espnUrl:'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard', league:'NHL' },
  tennis:     { icon:'🎾', name:'Теніс',      espnUrl:'https://site.api.espn.com/apis/site/v2/sports/tennis/scoreboard', league:'ATP/WTA' },
  mma:        { icon:'🥊', name:'UFC/MMA',    espnUrl:'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard', league:'UFC' },
  baseball:   { icon:'⚾', name:'MLB',        espnUrl:'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard', league:'MLB' },
  football:   { icon:'🏈', name:'NFL',        espnUrl:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', league:'NFL' },
  // ESPORTS — немає ESPN API, використовуємо fallback
  csgo:       { icon:'🎮', name:'CS2',        espnUrl: null, league:'BLAST Premier / ESL' },
  dota2:      { icon:'⚔️', name:'Dota 2',     espnUrl: null, league:'Dota Pro Circuit' },
  lol:        { icon:'🏆', name:'LoL',         espnUrl: null, league:'LEC / LCK / LPL' },
  valorant:   { icon:'🔫', name:'Valorant',    espnUrl: null, league:'VCT Champions' },
  efootball:  { icon:'⚡', name:'eFootball',   espnUrl: null, league:'eFootball League' },
};

// Хороші фіксовані матчі як fallback (реалістичні)
const FALLBACK_MATCHES = {
  soccer: [
    { id:'epl1', home:'Arsenal',         away:'Liverpool',        league:'Premier League', homeOdds:2.40, drawOdds:3.20, awayOdds:2.90, matchTime:null, isLive:false },
    { id:'epl2', home:'Manchester City', away:'Chelsea',          league:'Premier League', homeOdds:1.75, drawOdds:3.60, awayOdds:4.50, matchTime:null, isLive:false },
    { id:'epl3', home:'Tottenham',       away:'Manchester Utd',   league:'Premier League', homeOdds:2.10, drawOdds:3.30, awayOdds:3.40, matchTime:null, isLive:false },
    { id:'ucl1', home:'Real Madrid',     away:'Bayern München',   league:'Champions League', homeOdds:1.95, drawOdds:3.50, awayOdds:3.80, matchTime:null, isLive:false },
    { id:'ucl2', home:'PSG',             away:'Inter Milan',      league:'Champions League', homeOdds:2.20, drawOdds:3.40, awayOdds:3.10, matchTime:null, isLive:false },
  ],
  ucl: [
    { id:'ucl1', home:'Real Madrid',   away:'Bayern München', league:'Champions League', homeOdds:1.95, drawOdds:3.50, awayOdds:3.80, matchTime:null, isLive:false },
    { id:'ucl2', home:'PSG',           away:'Inter Milan',    league:'Champions League', homeOdds:2.20, drawOdds:3.40, awayOdds:3.10, matchTime:null, isLive:false },
    { id:'ucl3', home:'Barcelona',     away:'Arsenal',        league:'Champions League', homeOdds:2.05, drawOdds:3.25, awayOdds:3.50, matchTime:null, isLive:false },
    { id:'ucl4', home:'Atlético',      away:'Dortmund',       league:'Champions League', homeOdds:2.30, drawOdds:3.20, awayOdds:3.00, matchTime:null, isLive:false },
    { id:'ucl5', home:'Man City',      away:'Benfica',        league:'Champions League', homeOdds:1.50, drawOdds:4.00, awayOdds:5.50, matchTime:null, isLive:false },
  ],
  laliga: [
    { id:'ll1', home:'Real Madrid',  away:'Barcelona',   league:'La Liga', homeOdds:2.20, drawOdds:3.30, awayOdds:3.10, matchTime:null, isLive:false },
    { id:'ll2', home:'Atletico',     away:'Sevilla',     league:'La Liga', homeOdds:1.90, drawOdds:3.40, awayOdds:3.80, matchTime:null, isLive:false },
    { id:'ll3', home:'Villarreal',   away:'Valencia',    league:'La Liga', homeOdds:2.10, drawOdds:3.20, awayOdds:3.30, matchTime:null, isLive:false },
  ],
  bundesliga: [
    { id:'bl1', home:'Bayern München', away:'Borussia Dortmund', league:'Bundesliga', homeOdds:1.70, drawOdds:3.80, awayOdds:4.50, matchTime:null, isLive:false },
    { id:'bl2', home:'Bayer Leverkusen', away:'RB Leipzig',      league:'Bundesliga', homeOdds:2.00, drawOdds:3.30, awayOdds:3.50, matchTime:null, isLive:false },
    { id:'bl3', home:'Borussia Mönchengladbach', away:'Wolfsburg',league:'Bundesliga', homeOdds:2.20, drawOdds:3.20, awayOdds:3.10, matchTime:null, isLive:false },
  ],
  basketball: [
    { id:'nba1', home:'Boston Celtics',      away:'Golden State Warriors', league:'NBA', homeOdds:1.80, drawOdds:null, awayOdds:2.00, matchTime:null, isLive:false },
    { id:'nba2', home:'Los Angeles Lakers',   away:'Miami Heat',           league:'NBA', homeOdds:1.95, drawOdds:null, awayOdds:1.85, matchTime:null, isLive:false },
    { id:'nba3', home:'Milwaukee Bucks',      away:'Philadelphia 76ers',   league:'NBA', homeOdds:1.70, drawOdds:null, awayOdds:2.20, matchTime:null, isLive:false },
    { id:'nba4', home:'Phoenix Suns',         away:'Dallas Mavericks',     league:'NBA', homeOdds:2.00, drawOdds:null, awayOdds:1.80, matchTime:null, isLive:false },
    { id:'nba5', home:'Denver Nuggets',       away:'Memphis Grizzlies',    league:'NBA', homeOdds:1.60, drawOdds:null, awayOdds:2.40, matchTime:null, isLive:false },
  ],
  hockey: [
    { id:'nhl1', home:'Toronto Maple Leafs', away:'Montreal Canadiens',  league:'NHL', homeOdds:1.85, drawOdds:null, awayOdds:1.95, matchTime:null, isLive:false },
    { id:'nhl2', home:'Colorado Avalanche',  away:'Vegas Golden Knights', league:'NHL', homeOdds:2.00, drawOdds:null, awayOdds:1.80, matchTime:null, isLive:false },
    { id:'nhl3', home:'New York Rangers',    away:'Boston Bruins',        league:'NHL', homeOdds:2.10, drawOdds:null, awayOdds:1.75, matchTime:null, isLive:false },
    { id:'nhl4', home:'Florida Panthers',    away:'Tampa Bay Lightning',  league:'NHL', homeOdds:1.90, drawOdds:null, awayOdds:1.90, matchTime:null, isLive:false },
  ],
  tennis: [
    { id:'ten1', home:'Novak Djokovic', away:'Carlos Alcaraz',    league:'ATP Masters', homeOdds:1.95, drawOdds:null, awayOdds:1.85, matchTime:null, isLive:false },
    { id:'ten2', home:'Jannik Sinner',  away:'Daniil Medvedev',   league:'ATP 500',     homeOdds:1.75, drawOdds:null, awayOdds:2.10, matchTime:null, isLive:false },
    { id:'ten3', home:'Aryna Sabalenka',away:'Iga Swiatek',       league:'WTA 1000',    homeOdds:2.20, drawOdds:null, awayOdds:1.70, matchTime:null, isLive:false },
    { id:'ten4', home:'Andrey Rublev',  away:'Casper Ruud',       league:'ATP 500',     homeOdds:1.90, drawOdds:null, awayOdds:1.90, matchTime:null, isLive:false },
  ],
  mma: [
    { id:'ufc1', home:'Islam Makhachev',   away:'Charles Oliveira', league:'UFC LW Champ', homeOdds:1.55, drawOdds:null, awayOdds:2.55, matchTime:null, isLive:false },
    { id:'ufc2', home:'Jon Jones',         away:'Stipe Miocic',     league:'UFC HW',       homeOdds:1.45, drawOdds:null, awayOdds:2.80, matchTime:null, isLive:false },
    { id:'ufc3', home:'Alex Pereira',      away:'Magomed Ankalaev', league:'UFC LHW',      homeOdds:1.70, drawOdds:null, awayOdds:2.20, matchTime:null, isLive:false },
    { id:'ufc4', home:'Leon Edwards',      away:'Belal Muhammad',   league:'UFC WW',       homeOdds:2.05, drawOdds:null, awayOdds:1.80, matchTime:null, isLive:false },
  ],
  baseball: [
    { id:'mlb1', home:'New York Yankees',  away:'Boston Red Sox',   league:'MLB', homeOdds:1.80, drawOdds:null, awayOdds:2.00, matchTime:null, isLive:false },
    { id:'mlb2', home:'Los Angeles Dodgers',away:'San Francisco Giants',league:'MLB',homeOdds:1.60, drawOdds:null, awayOdds:2.40, matchTime:null, isLive:false },
    { id:'mlb3', home:'Houston Astros',    away:'Atlanta Braves',   league:'MLB', homeOdds:1.90, drawOdds:null, awayOdds:1.90, matchTime:null, isLive:false },
  ],
  football: [
    { id:'nfl1', home:'Kansas City Chiefs',  away:'San Francisco 49ers',league:'NFL Playoffs',homeOdds:1.75, drawOdds:null, awayOdds:2.10, matchTime:null, isLive:false },
    { id:'nfl2', home:'Dallas Cowboys',      away:'Philadelphia Eagles', league:'NFL',         homeOdds:2.00, drawOdds:null, awayOdds:1.80, matchTime:null, isLive:false },
    { id:'nfl3', home:'Baltimore Ravens',    away:'Cincinnati Bengals',  league:'NFL',         homeOdds:1.85, drawOdds:null, awayOdds:1.95, matchTime:null, isLive:false },
  ],
  // ===== ESPORTS =====
  csgo: [
    { id:'cs1', home:'Natus Vincere',  away:'FaZe Clan',       league:'BLAST Premier',      homeOdds:2.10, drawOdds:null, awayOdds:1.75, matchTime:null, isLive:false },
    { id:'cs2', home:'Team Vitality',  away:'G2 Esports',      league:'ESL Pro League',     homeOdds:1.85, drawOdds:null, awayOdds:1.95, matchTime:null, isLive:false },
    { id:'cs3', home:'Liquid',         away:'Cloud9',           league:'BLAST Premier',      homeOdds:1.70, drawOdds:null, awayOdds:2.20, matchTime:null, isLive:false },
    { id:'cs4', home:'MOUZ',           away:'Heroic',           league:'ESL Pro League',     homeOdds:2.00, drawOdds:null, awayOdds:1.82, matchTime:null, isLive:false },
    { id:'cs5', home:'Spirit',         away:'Virtus.pro',       league:'ESL One',            homeOdds:1.60, drawOdds:null, awayOdds:2.35, matchTime:null, isLive:false },
  ],
  dota2: [
    { id:'d1', home:'Team Spirit',    away:'OG',               league:'ESL One Bangkok',     homeOdds:1.65, drawOdds:null, awayOdds:2.25, matchTime:null, isLive:false },
    { id:'d2', home:'Gaimin Gladiators',away:'Nigma Galaxy',   league:'DPC WEU',            homeOdds:1.80, drawOdds:null, awayOdds:2.00, matchTime:null, isLive:false },
    { id:'d3', home:'Team Liquid',    away:'Alliance',          league:'DPC League',          homeOdds:1.55, drawOdds:null, awayOdds:2.50, matchTime:null, isLive:false },
    { id:'d4', home:'Tundra Esports', away:'Entity',            league:'DPC WEU',            homeOdds:1.90, drawOdds:null, awayOdds:1.90, matchTime:null, isLive:false },
  ],
  lol: [
    { id:'l1', home:'G2 Esports',    away:'Fnatic',            league:'LEC Spring',          homeOdds:1.75, drawOdds:null, awayOdds:2.10, matchTime:null, isLive:false },
    { id:'l2', home:'T1',            away:'Gen.G',             league:'LCK Spring',          homeOdds:2.00, drawOdds:null, awayOdds:1.80, matchTime:null, isLive:false },
    { id:'l3', home:'BLG',           away:'JDG',               league:'LPL Spring',          homeOdds:1.85, drawOdds:null, awayOdds:1.95, matchTime:null, isLive:false },
    { id:'l4', home:'Cloud9',        away:'100 Thieves',        league:'LCS Spring',          homeOdds:1.90, drawOdds:null, awayOdds:1.90, matchTime:null, isLive:false },
  ],
  valorant: [
    { id:'v1', home:'Sentinels',      away:'NRG Esports',       league:'VCT Americas',       homeOdds:1.95, drawOdds:null, awayOdds:1.85, matchTime:null, isLive:false },
    { id:'v2', home:'Fnatic',         away:'Team Liquid',        league:'VCT EMEA',           homeOdds:2.10, drawOdds:null, awayOdds:1.74, matchTime:null, isLive:false },
    { id:'v3', home:'Paper Rex',      away:'DRX',                league:'VCT Pacific',        homeOdds:1.80, drawOdds:null, awayOdds:2.00, matchTime:null, isLive:false },
    { id:'v4', home:'Evil Geniuses',  away:'LOUD',               league:'VCT Americas',       homeOdds:2.20, drawOdds:null, awayOdds:1.68, matchTime:null, isLive:false },
  ],
  efootball: [
    { id:'ef1', home:'FC Barcelona eS', away:'Real Madrid eS',  league:'eFootball League',   homeOdds:2.00, drawOdds:null, awayOdds:1.82, matchTime:null, isLive:false },
    { id:'ef2', home:'Man City eS',     away:'Chelsea eS',       league:'eFootball Cup',      homeOdds:1.75, drawOdds:null, awayOdds:2.10, matchTime:null, isLive:false },
    { id:'ef3', home:'PSG eS',          away:'Bayern eS',        league:'eFootball Champions',homeOdds:2.15, drawOdds:null, awayOdds:1.72, matchTime:null, isLive:false },
  ],
};

// AI аналіз по правилах (без API)
function generateAiAnalysis(match) {
  const homeOdds = parseFloat(match.homeOdds);
  const awayOdds = parseFloat(match.awayOdds);
  const fav = homeOdds < awayOdds ? match.home : match.away;
  const conf = Math.floor(52 + Math.random()*32);
  const reasons = [
    `${fav} мають найкращу форму в ${match.league} — ${conf}% шанс перемоги за статистикою xG.`,
    `Аналіз 10 останніх матчів: ${fav} виграли 7. Очікую перемогу з ${conf}% впевненістю.`,
    `${fav} домінують у ключових показниках: удари в ціль, позиція і xG. Прогноз: ${conf}%.`,
    `Поточна серія перемог та травмовані гравці суперника дають ${fav} перевагу — ${conf}%.`,
    `Статистика очних зустрічей: ${fav} виграли останні 3 матчі. AI впевненість: ${conf}%.`,
  ];
  return { analysis: reasons[Math.floor(Math.random()*reasons.length)], confidence: conf, aiPick: homeOdds < awayOdds ? 'home' : 'away' };
}

// Спробувати ESPN API, fallback на статичні матчі
async function loadRealSportMatches(sport, btnEl) {
  sportsCurrentSport = sport;
  document.querySelectorAll('.sport-tab-btn').forEach(b => b.classList.remove('active'));
  if(btnEl) btnEl.classList.add('active');

  const listEl = document.getElementById('sportMatchesList');
  const loadEl = document.getElementById('sportsLoadingEl');
  if(listEl) listEl.innerHTML = '';
  if(loadEl) { loadEl.classList.remove('hidden'); loadEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--fg-4);font-size:13px;">📡 Завантаження матчів...</div>'; }

  const meta = SPORT_META[sport];
  let matches = [];

  // Try ESPN API
  if(meta && meta.espnUrl) {
    try {
      const res = await fetch(meta.espnUrl + '?limit=10', { signal: AbortSignal.timeout(8000) });
      if(res.ok) {
        const data = await res.json();
        matches = parseESPNScoreboard(data, sport);
      }
    } catch(e) {
      console.log('ESPN API failed:', e.message);
    }
  }

  // Fallback to static matches
  if(!matches.length) {
    matches = (FALLBACK_MATCHES[sport] || FALLBACK_MATCHES.soccer).map(m => ({
      ...m,
      sport,
      ...generateAiAnalysis(m),
      matchTime: randomFutureMatchTime(),
    }));
  }

  // Store
  matches.forEach(m => { realMatches[m.id] = m; });
  publishFinalScores(matches);
  if(loadEl) loadEl.classList.add('hidden');
  renderRealMatches(matches);

  // Start live tracker for live ones
  const liveOnes = matches.filter(m => m.isLive);
  if(liveOnes.length && !liveTrackerTimer) startLiveTracker(liveOnes[0]);

  // Load bets
  loadSportMyBets();
}

// Матч, який ESPN позначив завершеним, отримує запис із рахунком — саме звідти
// checkPendingBetsOnStartup() бере результат. Без цього запису ставка на
// СПРАВЖНІЙ матч висіла три години й закривалась симуляцією, хоча рахунок
// приходив від ESPN з кожним оновленням списку. Пишемо тільки справжні
// результати (isFinal і обидва рахунки), щоб симуляція не підмінила реальний матч.
function publishFinalScores(matches) {
  if(!db || !matches) return;
  matches.forEach(function(m) {
    if(!m || !m.isFinal || !m.liveScore) return;
    if(m.liveScore.home == null || m.liveScore.away == null) return;
    db.ref('sport_matches/' + m.id).update({
      status: 'finished',
      finalScore: m.liveScore.home + ':' + m.liveScore.away,
      source: 'espn',
    });
  });
}

function randomFutureMatchTime() {
  const now = Date.now();
  const hours = 1 + Math.floor(Math.random() * 72);
  return new Date(now + hours * 3600000).toISOString();
}

function parseESPNScoreboard(data, sport) {
  const events = data.events || [];
  return events.slice(0, 6).map(ev => {
    const comp = ev.competitions?.[0];
    const comps = comp?.competitors || [];
    const home = comps.find(c => c.homeAway==='home') || comps[0] || {};
    const away = comps.find(c => c.homeAway==='away') || comps[1] || {};
    const statusType = ev.status?.type?.name || '';
    const isLive  = statusType === 'STATUS_IN_PROGRESS';
    const isFinal = statusType === 'STATUS_FINAL';
    const minute  = isLive ? (ev.status?.displayClock || '') : null;
    const homeScore = isLive||isFinal ? parseInt(home.score||0) : null;
    const awayScore = isLive||isFinal ? parseInt(away.score||0) : null;

    // Generate odds based on records
    const homeRec = home.records?.[0]?.summary || '';
    const awayRec = away.records?.[0]?.summary || '';
    const homeW = parseInt(homeRec.split('-')[0]) || 8;
    const awayW = parseInt(awayRec.split('-')[0]) || 6;
    const total = homeW + awayW + 4;
    const homeOdds = parseFloat((0.93 / (homeW / total) * 1.1).toFixed(2));
    const awayOdds = parseFloat((0.93 / (awayW / total) * 1.1).toFixed(2));

    const matchObj = {
      id:        'espn_' + ev.id,
      sport,
      home:      home.team?.shortDisplayName || home.team?.displayName || 'Home',
      away:      away.team?.shortDisplayName || away.team?.displayName || 'Away',
      league:    SPORT_META[sport]?.league || sport,
      matchTime: ev.date,
      isLive,
      isFinal,
      liveMinute: minute,
      liveScore: (homeScore!==null) ? { home: homeScore, away: awayScore } : null,
      homeOdds:  Math.max(1.10, Math.min(10, homeOdds)),
      drawOdds:  sport==='soccer' ? parseFloat((2.8+Math.random()*1.2).toFixed(2)) : null,
      awayOdds:  Math.max(1.10, Math.min(10, awayOdds)),
      homeLogo:  home.team?.logo || null,
      awayLogo:  away.team?.logo || null,
    };
    const ai = generateAiAnalysis(matchObj);
    return { ...matchObj, ...ai };
  }).filter(m => m.home !== 'Home');
}

function renderRealMatches(matches) {
  const listEl = document.getElementById('sportMatchesList');
  if(!listEl) return;
  if(!matches.length) {
    listEl.innerHTML = '<div style="text-align:center;color:var(--fg-4);padding:40px 0;font-size:13px;">Матчів не знайдено. Спробуйте інший вид спорту.</div>';
    return;
  }
  listEl.innerHTML = '';
  matches.forEach(m => {
    const card = document.createElement('div');
    card.className = 'match-card' + (m.isLive ? ' live' : '');
    card.id = 'match-card-' + m.id;
    card.innerHTML = buildMatchCardHTML(m);
    listEl.appendChild(card);
  });
}

function buildMatchCardHTML(m) {
  const isLive     = m.isLive;
  const isFinal    = m.isFinal || m.status === 'finished';
  const sport      = SPORT_META[m.sport] || SPORT_META.soccer;
  const hasDraw    = m.drawOdds !== null && m.drawOdds !== undefined;
  const confColor  = m.confidence >= 70 ? 'var(--green)' : m.confidence >= 55 ? '#f39c12' : '#e74c3c';
  const aiTeam     = m.aiPick==='home' ? shortName2(m.home) : m.aiPick==='away' ? shortName2(m.away) : 'Нічия';

  const timeStr = isFinal ? '🏁 Завершено' :
    isLive ? `<span style="color:var(--neg);font-weight:bold;animation:pulse2 1s infinite;">🔴 LIVE ${m.liveMinute||''}</span>` :
    m.matchTime ? '🕐 ' + new Date(m.matchTime).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '📅 Незабаром';

  const scoreHtml = (isLive || isFinal) && m.liveScore
    ? `<div class="live-score-badge">${m.liveScore.home} : ${m.liveScore.away}</div>`
    : `<div style="padding:8px 14px;color:var(--fg-4);font-size:12px;">vs</div>`;

  // Team logos (if from ESPN)
  const homeLogo = m.homeLogo ? `<img src="${safeUrl(m.homeLogo)}" style="width:28px;height:28px;object-fit:contain;border-radius:var(--r-xs);" onerror="this.style.display='none'">` : '';
  const awayLogo = m.awayLogo ? `<img src="${safeUrl(m.awayLogo)}" style="width:28px;height:28px;object-fit:contain;border-radius:var(--r-xs);" onerror="this.style.display='none'">` : '';

  const disabled = isFinal ? 'pointer-events:none;opacity:0.5;' : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:11px;color:var(--fg-4);font-weight:bold;">${sport.icon} ${m.league}</span>
      <span style="font-size:11px;">${timeStr}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:10px;">
      <div style="text-align:center;">
        ${homeLogo}
        <div style="font-size:13px;font-weight:bold;margin-top:${homeLogo?'4px':'0'};">${m.home}</div>
      </div>
      <div style="text-align:center;">${scoreHtml}</div>
      <div style="text-align:center;">
        ${awayLogo}
        <div style="font-size:13px;font-weight:bold;margin-top:${awayLogo?'4px':'0'};">${m.away}</div>
      </div>
    </div>
    <div class="match-odds-row" style="${disabled}">
      <div class="odds-btn" onclick="openBetSlip('${m.id}','home','${m.home.replace(/'/g,"\\'")}')">
        <div class="odds-label">${shortName2(m.home)}</div><div class="odds-val">${parseFloat(m.homeOdds).toFixed(2)}</div>
      </div>
      ${hasDraw ? `<div class="odds-btn" onclick="openBetSlip('${m.id}','draw','Нічия')">
        <div class="odds-label">Нічия</div><div class="odds-val">${parseFloat(m.drawOdds).toFixed(2)}</div>
      </div>` : ''}
      <div class="odds-btn" onclick="openBetSlip('${m.id}','away','${m.away.replace(/'/g,"\\'")}')">
        <div class="odds-label">${shortName2(m.away)}</div><div class="odds-val">${parseFloat(m.awayOdds).toFixed(2)}</div>
      </div>
    </div>
    <div style="background:var(--bg);border-left:3px solid ${confColor};border-radius:0 var(--r-md) var(--r-md) 0;padding:8px 10px;margin-top:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span style="font-size:11px;font-weight:bold;color:${confColor};">🤖 ШІ: ${aiTeam}</span>
        <span style="font-size:11px;font-weight:bold;color:${confColor};">${m.confidence||65}%</span>
      </div>
      <div style="font-size:10px;color:var(--fg-3);">${m.analysis||m.aiAnalysis||''}</div>
      <div style="background:var(--surface-1);border-radius:var(--r-xs);height:4px;margin-top:6px;overflow:hidden;">
        <div style="height:100%;background:${confColor};width:${m.confidence||65}%;transition:width 1s;"></div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
      ${isLive ? `<button onclick="openLiveView('${m.id}')" style="flex:1;min-width:70px;padding:8px;background:rgb(var(--neg-rgb) / 0.12);border:1px solid var(--neg);border-radius:var(--r-md);color:var(--neg);font-size:11px;font-weight:bold;cursor:pointer;">🔴 LIVE</button>` : ''}
      <button onclick="openMatchTracker('${m.id}')" style="flex:1;min-width:70px;padding:8px;background:rgb(var(--info-rgb) / 0.15);border:1px solid var(--info);border-radius:var(--r-md);color:var(--primary);font-size:11px;font-weight:bold;cursor:pointer;">📡 ТРЕКЕР</button>
      <button onclick="openStreamViewer('${m.sport}','${m.home.replace(/'/g,"\'")} vs ${m.away.replace(/'/g,"\'")} ')" style="flex:1;min-width:70px;padding:8px;background:color-mix(in srgb, var(--special) 12%, var(--surface-1));border:1px solid var(--special);border-radius:var(--r-md);color:var(--special);font-size:11px;font-weight:bold;cursor:pointer;">📺 СТРІМ</button>
    </div>
    ${isFinal ? `<div style="text-align:center;margin-top:6px;font-size:11px;color:var(--fg-4);">🏁 Матч завершено</div>` : ''}
  `;
}

function shortName2(n) { return n && n.length > 12 ? n.slice(0,11)+'…' : (n||''); }

// ---- Live Tracker (ESPN API оновлення) ----
function startLiveTracker(match) {
  if(liveTrackerTimer) clearInterval(liveTrackerTimer);
  liveTrackerTimer = setInterval(async () => {
    try {
      const meta = SPORT_META[match.sport];
      if(!meta?.espnUrl) return;
      const res = await fetch(meta.espnUrl + '?limit=20', { signal: AbortSignal.timeout(6000) });
      if(!res.ok) return;
      const data = await res.json();
      const events = data.events || [];
      const ev = events.find(e => ('espn_'+e.id) === match.id);
      if(!ev) return;
      const comp = ev.competitions?.[0];
      const comps = comp?.competitors || [];
      const home  = comps.find(c=>c.homeAway==='home')||comps[0]||{};
      const away  = comps.find(c=>c.homeAway==='away')||comps[1]||{};
      const statusType = ev.status?.type?.name||'';
      const isLive   = statusType==='STATUS_IN_PROGRESS';
      const isFinal  = statusType==='STATUS_FINAL';
      match.isLive   = isLive;
      match.isFinal  = isFinal;
      match.liveMinute = ev.status?.displayClock||'';
      if(isLive||isFinal) match.liveScore = { home: parseInt(home.score||0), away: parseInt(away.score||0) };
      realMatches[match.id] = match;
      const card = document.getElementById('match-card-'+match.id);
      if(card) card.innerHTML = buildMatchCardHTML(match);
      if(activeLiveMatchId===match.id && match.liveScore) updateLiveView(match, { homeScore:match.liveScore.home, awayScore:match.liveScore.away, minute:match.liveMinute, isFinished:isFinal, events:[] });
      if(isFinal) {
        clearInterval(liveTrackerTimer);
        settleMatchBets(match, { homeScore:match.liveScore?.home||0, awayScore:match.liveScore?.away||0, isFinished:true });
      }
    } catch(e) { console.warn(e); }
  }, 60000);
}

// ---- Settle bets ----
async function settleMatchBets(match, finalScore) {
  const snap = await db.ref('sport_bets').orderByChild('matchId').equalTo(match.id).once('value');
  const bets = snap.val(); if(!bets) return;
  const homeS = finalScore.homeScore, awayS = finalScore.awayScore;
  const winner = homeS > awayS ? 'home' : awayS > homeS ? 'away' : 'draw';
  for(const [betId, bet] of Object.entries(bets)) {
    if(bet.status !== 'pending') continue;
    const won = bet.outcome === winner;
    const payout = won ? Math.floor(bet.amount * bet.odds) : 0;
    // Атомарний claim статусу — без нього дві вкладки (чи повторний виклик
    // цієї функції) бачили status:'pending' з одного й того ж знімку й
    // ОБИДВІ нараховували виплату за одну ставку. Той самий підхід, що й
    // для PvP-ігор (Coinflip/RPS/Predict) — лише один запис виграє "гонку".
    const committed = await new Promise(resolve => {
      db.ref('sport_bets/'+betId+'/status').transaction(current => {
        if(current !== 'pending') return; // хтось вже розрахував — абортуємо
        return won ? 'won' : 'lost';
      }, (err, committed) => resolve(!!committed));
    });
    if(!committed) continue;
    await db.ref('sport_bets/'+betId).update({ settledAt: Date.now(), finalScore: homeS+':'+awayS });
    if(bet.userId === currentUser) {
      if(won) {
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
        playSound('bonus'); notify(`⚽ ${match.home} ${homeS}:${awayS} ${match.away} — +${formatNumber(payout)}₴!`, 'success');
        if(payout>=500) addToWinFeed('Спорт', payout, bet.odds);
      } else { playSound('loss'); notify(`⚽ ${match.home} ${homeS}:${awayS} ${match.away} — Програш`, 'error'); }
      addToHistory(`Спорт: ${won?'+'+payout:'-'+bet.amount}`);
    }
  }
  db.ref('sport_matches/'+match.id).update({ status:'finished', finalScore: homeS+':'+awayS });
}

// ---- Live View ----
function openLiveView(matchId) {
  const match = realMatches[matchId]; if(!match) return;
  activeLiveMatchId = matchId;
  let modal = document.getElementById('liveViewModal');
  if(!modal) { modal = document.createElement('div'); modal.id='liveViewModal'; modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:var(--bg);z-index:9500;overflow-y:auto;'; document.body.appendChild(modal); }
  modal.innerHTML = buildLiveViewHTML(match);
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function buildLiveViewHTML(m) {
  const h = m.liveScore?.home ?? 0, a = m.liveScore?.away ?? 0;
  const sport = SPORT_META[m.sport] || SPORT_META.soccer;
  return `<div style="background:var(--bg);min-height:100vh;padding:16px;padding-bottom:100px;box-sizing:border-box;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <button onclick="closeLiveView()" style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-md);padding:8px 14px;color:var(--fg-2);font-size:13px;cursor:pointer;">⬅ Назад</button>
      <div style="display:flex;align-items:center;gap:6px;"><div style="width:8px;height:8px;background:var(--neg);border-radius:50%;animation:pulse2 1s infinite;"></div><span style="color:var(--neg);font-size:12px;font-weight:bold;">LIVE</span></div>
      <div style="font-size:11px;color:var(--fg-4);">${sport.icon} ${m.league}</div>
    </div>
    <div style="background:linear-gradient(180deg,var(--surface-1),var(--bg));border:1px solid rgb(var(--pos-rgb) / .35);border-radius:var(--r-xl);padding:24px 16px;text-align:center;margin-bottom:16px;">
      <div style="font-size:11px;color:var(--fg-4);margin-bottom:12px;" id="liveMatchMinute">⏱ ${m.liveMinute||'0'}'</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-bottom:16px;">
        <div><div style="font-size:14px;font-weight:bold;">${m.home}</div></div>
        <div id="liveScoreBoard" style="background:var(--bg);border:2px solid rgb(var(--pos-rgb) / .35);border-radius:var(--r-lg);padding:12px 20px;">
          <div style="font-size:44px;font-weight:900;font-family:var(--font-mono);letter-spacing:4px;">${h}<span style="color:var(--fg-4);margin:0 4px;">:</span>${a}</div>
        </div>
        <div><div style="font-size:14px;font-weight:bold;">${m.away}</div></div>
      </div>
      <div id="liveStatsBar" style="display:flex;height:6px;border-radius:var(--r-xs);overflow:hidden;margin-bottom:8px;">
        <div style="background:var(--green);flex:${50};transition:flex 1s;"></div>
        <div style="background:var(--neg);flex:${50};transition:flex 1s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--fg-4);"><span id="liveHomePoss">50%</span><span>Позиція</span><span id="liveAwayPoss">50%</span></div>
    </div>
    <div style="background:var(--surface-1);border-radius:var(--r-lg);padding:14px;margin-bottom:14px;">
      <div style="font-size:13px;font-weight:bold;margin-bottom:8px;">📋 Події матчу</div>
      <div id="liveEventsList"><div style="color:var(--fg-4);font-size:12px;text-align:center;padding:20px;">⏳ Очікуємо події...</div></div>
    </div>
    <div style="background:var(--surface-1);border:1px solid rgb(var(--pos-rgb) / .35);border-radius:var(--r-lg);padding:14px;">
      <div style="font-size:13px;font-weight:bold;color:var(--accent);margin-bottom:10px;">⚡ Швидка ставка</div>
      <div class="match-odds-row" style="gap:6px;">
        <div class="odds-btn" onclick="openBetSlip('${m.id}','home','${m.home.replace(/'/g,"\\'")}')"><div class="odds-label">${shortName2(m.home)}</div><div class="odds-val">${m.homeOdds}</div></div>
        ${m.drawOdds?`<div class="odds-btn" onclick="openBetSlip('${m.id}','draw','Нічия')"><div class="odds-label">X</div><div class="odds-val">${m.drawOdds}</div></div>`:''}
        <div class="odds-btn" onclick="openBetSlip('${m.id}','away','${m.away.replace(/'/g,"\\'")}')"><div class="odds-label">${shortName2(m.away)}</div><div class="odds-val">${m.awayOdds}</div></div>
      </div>
    </div>
  </div>`;
}

function updateLiveView(match, score) {
  const minEl = document.getElementById('liveMatchMinute');
  const sbEl  = document.getElementById('liveScoreBoard');
  const evEl  = document.getElementById('liveEventsList');
  const statEl= document.getElementById('liveStatsBar');
  const hpEl  = document.getElementById('liveHomePoss');
  const apEl  = document.getElementById('liveAwayPoss');
  if(minEl) minEl.textContent = `⏱ ${score.minute||match.liveMinute||0}'`;
  if(sbEl) sbEl.innerHTML = `<div style="font-size:44px;font-weight:900;font-family:var(--font-mono);letter-spacing:4px;">${score.homeScore}<span style="color:var(--fg-4);margin:0 4px;">:</span>${score.awayScore}</div>`;
  if(evEl && score.events?.length) {
    const icons = {goal:'⚽',yellowCard:'🟨',redCard:'🟥',substitution:'🔄',penalty:'⚡'};
    evEl.innerHTML = [...score.events].reverse().map(ev => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);"><div style="min-width:28px;font-size:10px;color:var(--fg-4);">${ev.minute}'</div><div style="font-size:16px;">${icons[ev.type]||'📌'}</div><div><div style="font-size:12px;font-weight:bold;">${ev.player||''}</div><div style="font-size:10px;color:var(--fg-4);">${ev.team==='home'?match.home:match.away}</div></div></div>`).join('');
  }
  const hP = score.homeScore > score.awayScore ? 55 : score.awayScore > score.homeScore ? 45 : 50;
  if(statEl) statEl.innerHTML = `<div style="background:var(--green);flex:${hP};transition:flex 1s;"></div><div style="background:var(--neg);flex:${100-hP};transition:flex 1s;"></div>`;
  if(hpEl) hpEl.textContent = hP+'%'; if(apEl) apEl.textContent = (100-hP)+'%';
}

function closeLiveView() {
  const m = document.getElementById('liveViewModal');
  if(m) m.classList.add('hidden');
  document.body.style.overflow = '';
  activeLiveMatchId = null;
}

// ---- Bet Slip ----
function openBetSlip(matchId, outcome, team) {
  const match = realMatches[matchId]; if(!match) return;
  const odds = outcome==='home' ? match.homeOdds : outcome==='away' ? match.awayOdds : (match.drawOdds||3.40);
  currentBetSlip = { matchId, outcome, team, odds: parseFloat(odds), match };
  const modal = document.getElementById('betSlipModal');
  document.getElementById('betSlipMatchInfo').innerHTML =
    `<div style="font-size:11px;color:var(--fg-4);margin-bottom:4px;">${SPORT_META[match.sport]?.icon||'🏆'} ${match.league}</div>
     <div style="font-weight:bold;">${match.home} vs ${match.away}</div>
     <div style="color:var(--green);margin-top:4px;font-size:13px;">Ваша ставка: <b>${team}</b></div>`;
  document.getElementById('betSlipOdds').textContent = '×' + parseFloat(odds).toFixed(2);
  const tipEl = document.getElementById('betSlipAiTip');
  if(tipEl) tipEl.textContent = '🤖 ' + (match.analysis || match.aiAnalysis || 'ШІ аналіз недоступний');
  updateBetSlipPotential();
  modal.classList.remove('hidden');
}

function updateBetSlipPotential() {
  if(!currentBetSlip) return;
  const amt = parseInt(document.getElementById('betSlipAmount')?.value)||0;
  const el = document.getElementById('betSlipPotential');
  if(el) el.textContent = formatNumber(Math.floor(amt * currentBetSlip.odds)) + ' ₴';
}

function closeBetSlip() {
  const m = document.getElementById('betSlipModal'); if(m) m.classList.add('hidden');
  currentBetSlip = null;
}

function confirmRealSportBet() {
  if(!currentBetSlip) return;
  const bet = validateBet(document.getElementById('betSlipAmount').value); if(!bet) return;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet);
  const betRecord = {
    userId: currentUser, matchId: currentBetSlip.matchId,
    outcome: currentBetSlip.outcome, team: currentBetSlip.team,
    odds: currentBetSlip.odds, amount: bet,
    potential: Math.floor(bet * currentBetSlip.odds),
    status: 'pending',
    matchTitle: `${currentBetSlip.match.home} vs ${currentBetSlip.match.away}`,
    sport: currentBetSlip.match.sport, placedAt: Date.now()
  };
  db.ref('sport_bets').push(betRecord).then((ref) => {
    playSound('click');
    notify(`🎫 Ставку прийнято: ${bet}₴ на ${currentBetSlip.team} (×${currentBetSlip.odds.toFixed(2)})`, 'success');
    closeBetSlip();
    loadSportMyBets();
    if(currentBetSlip?.match && !liveTrackerTimer) startLiveTracker(currentBetSlip.match);
    // Якщо матч зі статичних даних (fallback) — запустити авторозрахунок через 30 секунд
    const matchId = betRecord.matchId;
    if(!matchId.startsWith('espn_')) {
      scheduleQuickSettle(ref.key, betRecord);
    }
  });
}

function loadSportMyBets() {
  const el = document.getElementById('sportMyBets'); if(!el) return;
  db.ref('sport_bets').orderByChild('userId').equalTo(currentUser).limitToLast(10).once('value', snap => {
    const bets = snap.val();
    if(!bets) { el.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:8px 0;">Немає ставок</div>'; return; }
    const sorted = Object.values(bets).sort((a,b) => b.placedAt - a.placedAt);
    el.innerHTML = sorted.map(b => {
      const sc = b.status==='won'?'var(--green)':b.status==='lost'?'var(--red)':'var(--accent)';
      const st = b.status==='won'?`✅ +${formatNumber(b.potential)}₴`:b.status==='lost'?`❌ -${formatNumber(b.amount)}₴`:'⏳ Очікує';
      return `<div style="background:var(--input);border:1px solid var(--border);border-radius:var(--r-md);padding:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:12px;font-weight:bold;">${(SPORT_META[b.sport]?.icon||'🏆')} ${b.team} <span style="font-size:10px;color:var(--fg-4);">×${b.odds}</span></div>
        <div style="font-size:10px;color:var(--fg-4);">${b.matchTitle||''}</div></div>
        <div style="text-align:right;"><div style="font-size:13px;font-weight:bold;color:${sc};">${st}</div><div style="font-size:10px;color:var(--fg-4);">${b.amount}₴</div></div>
      </div>`;
    }).join('');
  });
}

// Override old references
window.loadSportMatches = function(sport, btnEl) { loadRealSportMatches(sport, btnEl); };
window.confirmSportBet  = confirmRealSportBet;
// ══════════════════════════════════════════════════════
function checkPendingBetsOnStartup() {
  if(!currentUser) return;
  db.ref('sport_bets').orderByChild('userId').equalTo(currentUser).once('value', snap => {
    const bets = snap.val()||{};
    const pending = Object.entries(bets).filter(([,b])=>b.status==='pending');
    if(!pending.length) return;

    let settled = 0;
    const now = Date.now();
    for(const [betId, bet] of pending) {
      // Якщо ставка старіша 15 хвилин — розраховуємо результат
      const age = now - (bet.placedAt||now);
      if(age < 15 * 60 * 1000) continue; // ставка молодша 15 хвилин — чекаємо

      // Перевіряємо чи є реальний результат у Firebase
      db.ref('sport_matches/'+bet.matchId).once('value', mSnap => {
        const mData = mSnap.val();
        if(mData && mData.status === 'finished' && mData.finalScore) {
          // Є реальний результат — розраховуємо
          const [homeS, awayS] = mData.finalScore.split(':').map(Number);
          resolveOneBet(betId, bet, homeS, awayS);
        } else if(age > 3 * 3600 * 1000) {
          // Ставка старіша 3 годин і немає результату — симулюємо
          simulateAndResolveBet(betId, bet);
        }
      });
      settled++;
    }
    if(settled > 0) notify(`⚙️ Розраховуємо ${settled} ставок...`, 'info');
  });
}

// Розрахунок однієї ставки по відомому рахунку
function resolveOneBet(betId, bet, homeScore, awayScore) {
  const winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';
  const won = bet.outcome === winner;
  const payout = won ? Math.floor(bet.amount * bet.odds) : 0;
  // Атомарний claim — checkPendingBetsOnStartup() викликаний двічі (напр. з
  // двох вкладок, чи повторно з консолі) без цього бачив status:'pending'
  // в обох викликах і платив ту саму ставку двічі.
  db.ref('sport_bets/'+betId+'/status').transaction(current => {
    if(current !== 'pending') return;
    return won ? 'won' : 'lost';
  }, (err, committed) => {
    if(!committed) return;
    db.ref('sport_bets/'+betId).update({ settledAt: Date.now(), finalScore: homeScore+':'+awayScore });
    if(won) {
      db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
      playSound('bonus');
      notify(`🏆 ${bet.matchTitle||'Ставка'} — ВИГРАШ +${formatNumber(payout)}₴!`, 'success');
      if(payout >= 500) addToWinFeed('Спорт', payout, bet.odds);
    } else {
      playSound('loss');
      notify(`😞 ${bet.matchTitle||'Ставка'} — програш -${formatNumber(bet.amount)}₴`, 'error');
    }
    addToHistory(`Спорт: ${won?'+'+payout:'-'+bet.amount}`);
  });
}

// Симуляція результату для матчів без реального рахунку
function simulateAndResolveBet(betId, bet) {
  // Рандомний результат зважений на коефіцієнти
  const homeProb = 1 / (bet.odds || 2);
  const rand = Math.random();
  // Визначаємо переможця по ймовірностях з коефіцієнтів
  let simulatedWinner;
  if(bet.outcome === 'home') {
    // Якщо ставка на home — шанс виграти = 1/homeOdds (з коригуванням)
    simulatedWinner = rand < (1 / (bet.odds * 1.05)) ? 'home' : (rand < 0.65 ? 'away' : 'draw');
  } else if(bet.outcome === 'away') {
    simulatedWinner = rand < (1 / (bet.odds * 1.05)) ? 'away' : (rand < 0.65 ? 'home' : 'draw');
  } else {
    simulatedWinner = rand < (1 / (bet.odds * 1.05)) ? 'draw' : (rand < 0.5 ? 'home' : 'away');
  }
  const won = bet.outcome === simulatedWinner;
  const payout = won ? Math.floor(bet.amount * bet.odds) : 0;
  // Генеруємо правдоподібний рахунок
  const scoreMap = { soccer: [[1,0],[2,1],[1,1],[3,1],[0,1],[0,0],[2,0],[1,2]], basketball: [[108,101],[95,110],[122,115],[98,103]], other: [[1,0],[0,1],[2,1]] };
  const scores = scoreMap[bet.sport] || scoreMap.other;
  let sc;
  if(simulatedWinner === 'home') sc = scores.filter(s=>s[0]>s[1])[0] || [1,0];
  else if(simulatedWinner === 'away') sc = scores.filter(s=>s[0]<s[1])[0] || [0,1];
  else sc = scores.filter(s=>s[0]===s[1])[0] || [1,1];
  // Атомарний claim — той самий double-payout ризик, що й у resolveOneBet:
  // повторний виклик (напр. з іншої вкладки чи консолі) без цього платив би
  // ще раз, і навіть міг би дати ІНШИЙ рандомний результат вдруге.
  db.ref('sport_bets/'+betId+'/status').transaction(current => {
    if(current !== 'pending') return;
    return won ? 'won' : 'lost';
  }, (err, committed) => {
    if(!committed) return;
    db.ref('sport_bets/'+betId).update({ settledAt: Date.now(), finalScore: sc[0]+':'+sc[1], simulated: true });
    db.ref('sport_matches/'+bet.matchId).update({ status:'finished', finalScore: sc[0]+':'+sc[1] });
    if(won) {
      db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
      playSound('bonus');
      notify(`🏆 ${bet.matchTitle||'Ставка'} — ВИГРАШ +${formatNumber(payout)}₴ · рахунок не надійшов, результат визначено автоматично`, 'success');
      if(payout >= 500) addToWinFeed('Спорт', payout, bet.odds);
    } else {
      playSound('loss');
      notify(`😞 ${bet.matchTitle||'Ставка'} — програш · рахунок не надійшов, результат визначено автоматично`, 'error');
    }
    addToHistory(`Спорт: ${won?'+'+payout:'-'+bet.amount}`);
  });
}

// Запустити розрахунок одразу після підтвердження ставки (через 30 сек для демо)
function scheduleQuickSettle(betId, bet) {
  setTimeout(() => {
    db.ref('sport_bets/'+betId).once('value', snap => {
      const b = snap.val();
      if(b && b.status === 'pending') simulateAndResolveBet(betId, b);
    });
  }, 30000); // 30 секунд — для демо/тестування
}

