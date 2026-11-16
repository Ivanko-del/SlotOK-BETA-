// ========================
// HOME STATS + JACKPOT
// ========================
function updateHomeStats() {
  if(!currentUser) return;
  const statBets = document.getElementById('homeStatBets');
  const statWins = document.getElementById('homeStatWins');
  const statVip  = document.getElementById('homeStatVip');
  const jackEl   = document.getElementById('homeJackpot');
  if(statBets && userData) {
    animateNumberText(statBets, userData.totalBets||0, '');
    animateNumberText(statWins, userData.totalWins||0, '₴');
  }
  // VIP level
  if(statVip && userData) {
    // Був третій захардкоджений список рівнів із власними порогами, та ще й
    // по полю totalWager, якого ніхто не пише — герб на Головній вічно
    // показував «Iron». Джерело те саме, що й на екрані VIP.
    statVip.textContent = getVipLevel(userData.totalWagered || 0).name;
  }
}



// ============================================================
// ===== СИСТЕМА ДОСЯГНЕНЬ (50 штук) =====
// ============================================================
const ACHIEVEMENTS = [
  // ── ПЕРШІ КРОКИ ──
  { id:'first_game',      icon:'🎮', name:'Перша гра',           desc:'Зіграй будь-яку гру',                  cat:'Початок',   xp:10,  cond: d => (d.totalGames||0) >= 1 },
  { id:'first_win',       icon:'🏆', name:'Перший виграш',       desc:'Виграй будь-яку ставку',               cat:'Початок',   xp:15,  cond: d => (d.totalWins||0) >= 1 },
  { id:'register_done',   icon:'👤', name:'Ласкаво просимо!',    desc:'Зареєструйся',                         cat:'Початок',   xp:5,   cond: d => true },
  // ── СЛОТИ ──
  { id:'slots_10',        icon:'🎰', name:'Одноруких 10',        desc:'10 ігор у слотах',                     cat:'Слоти',     xp:20,  cond: d => (d.slotsPlayed||0) >= 10 },
  { id:'slots_100',       icon:'🎰', name:'Слотоман',            desc:'100 ігор у слотах',                    cat:'Слоти',     xp:50,  cond: d => (d.slotsPlayed||0) >= 100 },
  { id:'slots_777',       icon:'7️⃣',  name:'Lucky 777',          desc:'Вибий 7-7-7 у слотах',                cat:'Слоти',     xp:100, cond: d => (d.slots777||0) >= 1 },
  { id:'slots_jackpot',   icon:'💰', name:'ДЖЕКПОТ!',            desc:'Виграй 50к+ у слотах',                 cat:'Слоти',     xp:150, cond: d => (d.slotsMaxWin||0) >= 50000 },
  { id:'slots_diamond',   icon:'💎', name:'Три Діаманти',        desc:'Вибий 💎💎💎 у слотах',               cat:'Слоти',     xp:80,  cond: d => (d.slotsDiamond||0) >= 1 },
  // ── КРАШ ──
  { id:'crash_10x',       icon:'🚀', name:'Місяць',              desc:'Виведи при x10 або більше',            cat:'Краш',      xp:60,  cond: d => (d.crashBest||0) >= 10 },
  { id:'crash_50x',       icon:'🌙', name:'Орбіта',              desc:'Виведи при x50 або більше',            cat:'Краш',      xp:120, cond: d => (d.crashBest||0) >= 50 },
  { id:'crash_cashout',   icon:'✈️', name:'Вчасно!',             desc:'10 успішних виведень з краша',         cat:'Краш',      xp:40,  cond: d => (d.crashCashouts||0) >= 10 },
  { id:'crash_100',       icon:'🎯', name:'Краш Майстер',        desc:'100 ігор у крашу',                     cat:'Краш',      xp:50,  cond: d => (d.crashGames||0) >= 100 },
  // ── РУЛЕТКА ──
  { id:'roulette_green',  icon:'🟢', name:'Зелений Шанс',        desc:'Вгадай зелений (0)',                   cat:'Рулетка',   xp:100, cond: d => (d.rouletteGreen||0) >= 1 },
  { id:'roulette_streak', icon:'🔴', name:'7 на 7',              desc:'7 виграшів поспіль у рулетці',         cat:'Рулетка',   xp:80,  cond: d => (d.rouletteStreak||0) >= 7 },
  { id:'roulette_50',     icon:'🎡', name:'Колесо крутиться',    desc:'50 ігор у рулетці',                    cat:'Рулетка',   xp:40,  cond: d => (d.rouletteBets||0) >= 50 },
  // ── МАЙНЕР ──
  { id:'mines_5x5',       icon:'💣', name:'Сапер',               desc:'Відкрий всі 24 клітини без міни',      cat:'Майнер',    xp:200, cond: d => (d.minesPerfect||0) >= 1 },
  { id:'mines_50',        icon:'💥', name:'Мінне поле',          desc:'50 ігор у майнері',                    cat:'Майнер',    xp:40,  cond: d => (d.minesGames||0) >= 50 },
  { id:'mines_big',       icon:'💰', name:'Скарб!',              desc:'Виграй 10к+ в майнері за раз',         cat:'Майнер',    xp:80,  cond: d => (d.minesMaxWin||0) >= 10000 },
  // ── ФІНАНСИ ──
  { id:'balance_10k',     icon:'💵', name:'10 тисяч',            desc:'Накопич 10 000 ₴ на балансі',          cat:'Фінанси',   xp:30,  cond: d => (d.balance||0) >= 10000 },
  { id:'balance_100k',    icon:'💰', name:'100 тисяч',           desc:'Накопич 100 000 ₴ на балансі',         cat:'Фінанси',   xp:80,  cond: d => (d.balance||0) >= 100000 },
  { id:'balance_1m',      icon:'🤑', name:'Мільйонер!',          desc:'Накопич 1 000 000 ₴ на балансі',       cat:'Фінанси',   xp:300, cond: d => (d.balance||0) >= 1000000 },
  { id:'wager_100k',      icon:'📈', name:'Ризиковий',           desc:'Загальна сума ставок 100 000 ₴',       cat:'Фінанси',   xp:50,  cond: d => (d.totalWagered||0) >= 100000 },
  { id:'wager_1m',        icon:'🔥', name:'Хай-роллер',          desc:'Загальна сума ставок 1 000 000 ₴',     cat:'Фінанси',   xp:200, cond: d => (d.totalWagered||0) >= 1000000 },
  { id:'cashback_claim',  icon:'💸', name:'Перший кешбек',       desc:'Отримай перший кешбек',                cat:'Фінанси',   xp:30,  cond: d => (d.cashbackTotalClaimed||0) >= 1 },
  // ── СОЦІАЛЬНІ ──
  { id:'chat_10',         icon:'💬', name:'Балакучий',           desc:'Надішли 10 повідомлень у чаті',        cat:'Соціальні', xp:15,  cond: d => (d.chatMessages||0) >= 10 },
  { id:'referral_1',      icon:'👥', name:'Перший реферал',      desc:'Запроси першого друга',                cat:'Соціальні', xp:50,  cond: d => (d.referrals||0) >= 1 },
  { id:'referral_5',      icon:'🌟', name:'Інфлюєнсер',         desc:'Запроси 5 друзів',                     cat:'Соціальні', xp:150, cond: d => (d.referrals||0) >= 5 },
  { id:'clan_join',       icon:'⚔️', name:'Командний гравець',   desc:'Вступи до клану',                     cat:'Соціальні', xp:30,  cond: d => !!(d.clanId) },
  { id:'duel_win',        icon:'🤺', name:'Дуелянт',             desc:'Виграй 5 дуелей',                     cat:'Соціальні', xp:80,  cond: d => (d.duelWins||0) >= 5 },
  // ── VIP / ПРОГРЕС ──
  { id:'vip_silver',      icon:'🥈', name:'Срібний',             desc:'Досягни VIP рівня Silver',             cat:'VIP',       xp:40,  cond: d => (d.totalWagered||0) >= 5000 },
  { id:'vip_gold',        icon:'🥇', name:'Золотий',             desc:'Досягни VIP рівня Gold',               cat:'VIP',       xp:80,  cond: d => (d.totalWagered||0) >= 20000 },
  { id:'vip_platinum',    icon:'💎', name:'Платиновий',          desc:'Досягни VIP рівня Platinum',           cat:'VIP',       xp:200, cond: d => (d.totalWagered||0) >= 700000 },
  { id:'daily_7',         icon:'📅', name:'Тижнева звичка',      desc:'7 днів поспіль щоденний бонус',        cat:'VIP',       xp:50,  cond: d => (d.dailyStreak||0) >= 7 },
  { id:'daily_30',        icon:'🗓️', name:'Місячна звичка',      desc:'30 днів поспіль щоденний бонус',       cat:'VIP',       xp:200, cond: d => (d.dailyStreak||0) >= 30 },
  { id:'quest_10',        icon:'📋', name:'Виконавець',          desc:'Виконай 10 квестів',                   cat:'VIP',       xp:60,  cond: d => (d.questsCompleted||0) >= 10 },
  // ── ОСОБЛИВІ ──
  { id:'tournament_win',  icon:'🥇', name:'Чемпіон',             desc:'Перемогти у турнірі',                  cat:'Особливі',  xp:300, cond: d => (d.tournamentsWon||0) >= 1 },
  { id:'tournament_5',    icon:'🏅', name:'Турнірний гравець',   desc:'Взяти участь у 5 турнірах',            cat:'Особливі',  xp:100, cond: d => (d.tournamentsJoined||0) >= 5 },
  { id:'slots_free_use',  icon:'🎟️', name:'На халяву',           desc:'Використай безкоштовний спін',         cat:'Особливі',  xp:20,  cond: d => (d.freeSlotsUsed||0) >= 1 },
  { id:'win_500k',        icon:'🚀', name:'Пів мільярда!',       desc:'Виграй 500 000 ₴ за одну ставку',      cat:'Особливі',  xp:500, cond: d => (d.biggestWin||0) >= 500000 },
  { id:'loss_1m',         icon:'😅', name:'Залізні нерви',       desc:'Програй в сумі 1 000 000 ₴',           cat:'Особливі',  xp:100, cond: d => (d.totalLosses||0) >= 1000000 },
  { id:'night_owl',       icon:'🦉', name:'Нічна пташка',        desc:'Зіграй між 00:00–05:00',               cat:'Особливі',  xp:30,  cond: d => (d.nightGames||0) >= 1 },
  { id:'slotiky_buy',     icon:'🪙', name:'Перші Слотіки',       desc:'Купи перший Слотік',                   cat:'Особливі',  xp:40,  cond: d => (d.slotiky||0) > 0 || (d.slotikySpent||0) > 0 },
  { id:'shop_purchase',   icon:'🛒', name:'Перша покупка',       desc:'Купи щось у магазині Слотіків',         cat:'Особливі',  xp:25,  cond: d => Object.keys(d.slotikyItems||{}).length >= 1 },
  { id:'all_games',       icon:'🎲', name:'Всеїдний',            desc:'Зіграй у 8 різних ігор',               cat:'Особливі',  xp:120, cond: d => (d.uniqueGames||0) >= 8 },
  { id:'legend',          icon:'👑', name:'ЛЕГЕНДА',             desc:'Збери 2000+ XP досягнень',             cat:'Особливі',  xp:0,   cond: d => (d.achievementXP||0) >= 2000 },
  // ── НОВІ v61 ──
  { id:'limbo_100x',      icon:'🌀', name:'Космос',              desc:'Вгадай множник x100+ у Limbo',         cat:'Limbo',     xp:150, cond: d => (d.limboMax||0) >= 100 },
  { id:'limbo_25',        icon:'🎯', name:'Гравець Limbo',       desc:'25 ігор у Limbo',                      cat:'Limbo',     xp:40,  cond: d => (d.limboGames||0) >= 25 },
  { id:'pm_10',           icon:'✉️', name:'Листоноша',           desc:'Надішли 10 приватних повідомлень',     cat:'Соціальні', xp:20,  cond: d => (d.pmSent||0) >= 10 },
  { id:'pm_pen_pal',      icon:'📬', name:'Перо і папір',        desc:'50 приватних повідомлень',             cat:'Соціальні', xp:60,  cond: d => (d.pmSent||0) >= 50 },
  { id:'wins_streak_5',   icon:'🔥', name:'5 перемог поспіль',   desc:'Виграй 5 ставок підряд',               cat:'Початок',   xp:80,  cond: d => (d.winStreak||0) >= 5 },
  { id:'wins_streak_10',  icon:'⚡', name:'10 перемог поспіль',  desc:'Виграй 10 ставок підряд',              cat:'Особливі',  xp:200, cond: d => (d.winStreak||0) >= 10 },
  { id:'blackjack_bj',    icon:'🃏', name:'Блекджек!',           desc:'Отримай натуральний Блекджек',         cat:'Блекджек',  xp:60,  cond: d => (d.bjNaturals||0) >= 1 },
  { id:'blackjack_split', icon:'✌️', name:'Спліт-майстер',       desc:'Зроби спліт у Блекджек',               cat:'Блекджек',  xp:40,  cond: d => (d.bjSplits||0) >= 1 },
  { id:'blackjack_21',    icon:'🔢', name:'Двадцять один!',      desc:'Набери рівно 21 очко',                 cat:'Блекджек',  xp:80,  cond: d => (d.bj21||0) >= 1 },
  { id:'plinko_edge',     icon:'🎯', name:'По краю',             desc:'Потрап у крайню комірку Plinko',       cat:'Plinko',    xp:80,  cond: d => (d.plinkoEdge||0) >= 1 },
  { id:'plinko_50',       icon:'🔻', name:'Гравець Plinko',      desc:'50 ігор у Plinko',                     cat:'Plinko',    xp:40,  cond: d => (d.plinkoGames||0) >= 50 },
  { id:'balance_500k',    icon:'💎', name:'Пів мільйона!',       desc:'Накопич 500 000 ₴ на балансі',         cat:'Фінанси',   xp:150, cond: d => (d.balance||0) >= 500000 },
  { id:'wager_500k',      icon:'📊', name:'Хай-стейкс',         desc:'Загальна сума ставок 500 000 ₴',       cat:'Фінанси',   xp:100, cond: d => (d.totalWagered||0) >= 500000 },
  { id:'crash_2x5',       icon:'🎢', name:'Стабільний',          desc:'5 виведень між x2–x3 в Crash',        cat:'Краш',      xp:60,  cond: d => (d.crashMid||0) >= 5 },
  { id:'all_pvp',         icon:'🎮', name:'PvP Поліглот',        desc:'Зіграй в Монетку, RPS і Предикшн',    cat:'Особливі',  xp:80,  cond: d => (d.pvpCoinflip||0)>0&&(d.pvpRps||0)>0&&(d.pvpPredict||0)>0 },
  { id:'night_streak',    icon:'🌙', name:'Нічний марафон',      desc:'10 ігор після опівночі',               cat:'Особливі',  xp:60,  cond: d => (d.nightGames||0) >= 10 },
  { id:'fortune_jackpot', icon:'🎡', name:'Джекпот Колеса!',     desc:'Виграй x50 на Колесі Фортуни',        cat:'Особливі',  xp:200, cond: d => (d.fortuneJackpot||0) >= 1 },
  { id:'coins_50',        icon:'🪙', name:'Слотік-колекціонер',  desc:'Накопич 50 Слотіків',                  cat:'VIP',       xp:50,  cond: d => (d.slotiky||0) >= 50 },
  { id:'lootbox_10',      icon:'📦', name:'Збирач скарбів',      desc:'Відкрий 10 лут-боксів',               cat:'Особливі',  xp:80,  cond: d => (d.lootboxesOpened||0) >= 10 },
];

function checkAchievements(trigger, value) {
  if(!currentUser || !userData) return;
  const owned = userData.achievements || {};
  const newOnes = [];
  let totalXP = userData.achievementXP || 0;

  ACHIEVEMENTS.forEach(a => {
    if(owned[a.id]) return; // already unlocked
    try {
      if(a.cond(userData)) {
        newOnes.push(a);
        owned[a.id] = { unlockedAt: Date.now(), xp: a.xp };
        totalXP += a.xp;
      }
    } catch(e) { console.warn(e); }
  });

  if(newOnes.length) {
    db.ref('users/'+currentUser).update({ achievements: owned, achievementXP: totalXP });
    newOnes.forEach((a, i) => {
      setTimeout(() => {
        const t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:7000;background:linear-gradient(135deg,var(--surface-1),color-mix(in srgb, var(--accent) 9%, var(--surface-1)));border:2px solid var(--accent);border-radius:var(--r-lg);padding:14px 20px;display:flex;align-items:center;gap:12px;box-shadow:none;min-width:250px;animation:slideIn 0.4s ease;';
        t.innerHTML = `<div style="font-size:32px;">${a.icon}</div><div><div style="font-size:11px;color:var(--accent);font-weight:bold;text-transform:uppercase;letter-spacing:1px;">🏆 НОВЕ ДОСЯГНЕННЯ!</div><div style="font-size:14px;font-weight:bold;color:var(--fg);margin-top:2px;">${a.name}</div><div style="font-size:11px;color:var(--fg-3);margin-top:1px;">${a.desc}</div><div style="font-size:10px;color:var(--accent);margin-top:3px;">+${a.xp} XP</div></div>`;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.5s'; setTimeout(()=>t.remove(),500); }, 3500);
      }, i * 1200);
    });
  }
}

function initAchievementsTab() {
  const owned = userData.achievements || {};
  const totalXp = userData.achievementXP || 0;
  const el = document.getElementById('achievementsGrid');
  if(!el) return;
  const unlockedCount = Object.keys(owned).length;
  const totalCount = ACHIEVEMENTS.length;

  const header = document.getElementById('achievementsHeader');
  if(header) header.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="text-align:center;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;">
        <div style="font-size:22px;font-weight:900;color:var(--accent);">${unlockedCount}</div>
        <div style="font-size:10px;color:var(--fg-4);">з ${totalCount}</div>
      </div>
      <div style="text-align:center;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;">
        <div style="font-size:22px;font-weight:900;color:var(--green);">${totalXp}</div>
        <div style="font-size:10px;color:var(--fg-4);">XP</div>
      </div>
      <div style="text-align:center;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;">
        <div style="font-size:22px;font-weight:900;color:var(--special);">${Math.round(unlockedCount/totalCount*100)}%</div>
        <div style="font-size:10px;color:var(--fg-4);">Виконано</div>
      </div>
    </div>
    <div style="background:var(--surface-1);border-radius:var(--r-md);height:8px;overflow:hidden;margin-bottom:16px;">
      <div style="height:100%;width:${Math.round(unlockedCount/totalCount*100)}%;background:var(--accent);border-radius:var(--r-md);transition:width 0.5s;"></div>
    </div>`;

  const cats = {};
  ACHIEVEMENTS.forEach(a => {
    if(!cats[a.cat]) cats[a.cat] = [];
    cats[a.cat].push(a);
  });
  el.innerHTML = '';
  Object.entries(cats).forEach(([cat, items]) => {
    const catUnlocked = items.filter(a => owned[a.id]).length;
    el.innerHTML += `<div style="font-size:12px;font-weight:bold;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px;border-left:3px solid var(--accent);padding-left:8px;">${cat} (${catUnlocked}/${items.length})</div>`;
    el.innerHTML += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">${
      items.map(a => {
        const unlocked = !!owned[a.id];
        const ts = owned[a.id]?.unlockedAt ? new Date(owned[a.id].unlockedAt).toLocaleDateString('uk') : '';
        return `<div style="background:${unlocked?'linear-gradient(135deg,var(--surface-1),color-mix(in srgb, var(--accent) 9%, var(--surface-1)))':'var(--bg)'};border:1px solid ${unlocked?'var(--accent)':'var(--line)'};border-radius:var(--r-lg);padding:12px;opacity:${unlocked?1:0.55};position:relative;overflow:hidden;">
          ${unlocked?'<div style="position:absolute;top:4px;right:6px;font-size:9px;color:var(--accent);">✓</div>':''}
          <div style="font-size:24px;margin-bottom:4px;">${a.icon}</div>
          <div style="font-size:11px;font-weight:bold;color:${unlocked?'var(--fg)':'var(--fg-3)'};">${a.name}</div>
          <div style="font-size:9px;color:var(--fg-4);margin-top:2px;line-height:1.4;">${a.desc}</div>
          <div style="font-size:9px;color:${unlocked?'var(--accent)':'var(--fg-4)'};margin-top:4px;font-weight:bold;">+${a.xp} XP ${ts?'• '+ts:''}</div>
        </div>`;
      }).join('')
    }</div>`;
  });
}


