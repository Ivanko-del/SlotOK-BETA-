// Генерує правила Firebase Realtime Database → database.rules.json
// (той файл, на який вказує firebase.json). Одна версія правил — колишню
// «фазу 1» (відкрите читання й запис без входу) і database.rules.strict.json
// прибрано в листопаді 2026 після блокування бази Google за витік даних.
//
// Принцип — закрито за замовчуванням:
//   • без входу (auth == null) не читається майже нічого: лише стрічка виграшів
//     і загальна сума ставок на екрані входу (win_feed, casino_stats);
//   • будь-який запис — лише з Firebase Auth (api/auth.js видає custom token,
//     auth.uid = нік) і лише у своє, адміну — адмінське, решту пише сервер
//     (api/*, сервісний акаунт оминає правила);
//   • хеші паролів/відповідей — лише user_secrets, куди браузер не має доступу
//     ні на читання, ні на запис (навіть адмін). У users/ їх писати заборонено.
//
// Запуск: node scripts/build-rules.js        (перезаписує database.rules.json)
//         node scripts/build-rules.js --check (лише перевіряє, що файл актуальний)
//
// Правила лежать у JSON без коментарів, тому пояснення — тут, у SECURITY.md і DEPLOY.md.

const fs = require("fs");
const path = require("path");

const OWNER = "theivankoo";
const BAD = `/[<>"'\`]/`; // символи, з яких складається HTML-ін'єкція в атрибут/тег
const MAX_URL = 10485760; // ліміт рядка RTDB — 10 МБ (фото в base64)

const str = (max) => `newData.isString() && newData.val().length <= ${max}`;
const safe = (max) => `${str(max)} && !newData.val().matches(${BAD})`;
const url = `${str(MAX_URL)} && newData.val().matches(/^(https?:|data:(image|video)\\/|blob:)/) && !newData.val().matches(${BAD})`;
const num = (max) => `newData.isNumber() && newData.val() <= ${max} && newData.val() >= -${max}`;
const v = (expr) => ({ ".validate": expr });

// Поля, що потрапляють у розмітку інших гравців.
const AVATAR_FIELDS = {
  avatar: v(`${str(MAX_URL)} && !newData.val().matches(${BAD})`),
  avatarUrl: v(url),
  avatarEmoji: v(safe(32)),
  authorAvatarUrl: v(url),
  authorEmoji: v(safe(32)),
};
const NICK_FIELDS = (names) => Object.fromEntries(names.map((n) => [n, v(safe(64))]));
const MEDIA_FIELDS = { imgUrl: v(url), mediaUrl: v(url) };
const TEXT = (max) => ({ text: v(str(max)), msg: v(str(max)) });

function chatMessage(nickFields) {
  return { ...NICK_FIELDS(nickFields), ...AVATAR_FIELDS, ...MEDIA_FIELDS, ...TEXT(4000) };
}

function build() {
  const authed = "auth != null";
  const isAdmin = `(auth != null && (auth.uid === '${OWNER}' || root.child('users').child(auth.uid).child('isAdmin').val() === true))`;
  // Роль support (users/<нік>/role, ставить лише адмін): читає всі звернення
  // і міняє в них статус/відповідь. Адмін має це завжди.
  const isSupport = `(auth != null && (${isAdmin} || root.child('users').child(auth.uid).child('role').val() === 'support'))`;
  const owner = (v_) => `auth != null && (auth.uid === ${v_} || ${isAdmin})`;
  const onlyMe = (v_) => `auth != null && auth.uid === ${v_}`;
  // Чат: нове повідомлення лише від свого імені й разом з оновленням
  // chat_rate/<нік> = now (антиспам ≥ 2 с, postChatMessage в app.js);
  // видалити можна лише своє; адмін — будь-що.
  const chatWrite = (senderField) =>
    `auth != null && (${isAdmin}` +
    ` || (!data.exists() && newData.child('${senderField}').val() === auth.uid && newData.parent().parent().child('chat_rate').child(auth.uid).val() === now` +
    ` && (!root.child('chat_rate').child(auth.uid).exists() || root.child('chat_rate').child(auth.uid).val() < now - 2000))` +
    ` || (!newData.exists() && data.child('${senderField}').val() === auth.uid))`;
  // Новий запис від свого імені (поле field === auth.uid); видалити — своє або адмін.
  const ownEntry = (field) =>
    `auth != null && (${isAdmin} || (!data.exists() && newData.child('${field}').val() === auth.uid) || (!newData.exists() && data.child('${field}').val() === auth.uid))`;
  // Спільний стан, який браузер поки пише сам (мультиплеєр, клани): лише
  // залогінені, читати — лише залогінені. Справжній захист — перенос на
  // сервер (api/room.js), див. ROADMAP.md.
  const clientShared = (extra = {}) => ({ ".read": authed, $k: { ".write": authed }, ...extra });
  const adminNode = (extra = {}) => ({ ".read": authed, ".write": isAdmin, ...extra });
  const serverOnly = (read = authed) => ({ ".read": read, ".write": false });
  const increaseOnlyNum = `auth != null && newData.isNumber() && (${isAdmin} || (data.exists() ? newData.val() >= data.val() : newData.val() >= 0))`;

  // users/$u — сам вузол ($u як ціле) пише лише адмін (реєстрацію робить
  // сервер), кожне поле — власник; адмінські поля — лише адмін.
  const userFieldOwner = { ".write": owner("$u") };
  const adminOnly = { ".write": isAdmin };
  const increaseOnly = (f) => ({
    ".write": `auth != null && (auth.uid === $u || ${isAdmin} || (data.exists() ? newData.isNumber() && newData.val() >= data.val() : newData.isNumber() && newData.val() >= 0))`,
    ...(userNode[f] || {}),
  });
  const userNode = {
    ".validate": `data.exists() || ($u.length >= 2 && $u.length <= 32 && !$u.matches(${BAD}) && !$u.matches(/[ \\\\&%]/))`,
    balance: v(`newData.isNumber() && newData.val() < 1000000000000000 && (newData.val() >= 0 || (data.exists() && newData.val() >= data.val()))`),
    tag: v(safe(120)),
    bioInput: v(str(1000)),
    // Секрети й приватне — НЕ в users/ (вузол бачать усі залогінені):
    // хеші → user_secrets (лише сервер), email/IP-хеш/Telegram/журнал безпеки →
    // user_private (власник і адмін). Записати сюди не може ніхто, навіть адмін;
    // видалити (міграція) — можна, бо .validate на видалення не діє.
    pass: v("false"),
    securityAnswerHash: v("false"),
    securityAnswer: v("false"),
    birthDate: v("false"),
    email: v("false"),
    lastIP: v("false"),
    lastIpHash: v("false"),
    securityLog: v("false"),
    ...AVATAR_FIELDS,
  };
  Object.assign(userNode, {
    "$field": userFieldOwner,
    // Вхідні лічильники/зарахування від інших гравців (ПМ, реферали, виграш у
    // PvP, переказ): чужий гравець може лише ЗБІЛЬШИТИ значення.
    balance: increaseOnly("balance"),
    pmUnread: increaseOnly("pmUnread"),
    referrals: increaseOnly("referrals"),
    isAdmin: adminOnly,
    adminPerms: adminOnly,
    role: { ...adminOnly, ...v("newData.isString() && newData.val().matches(/^(support|admin)$/)") },
    // Магазин Слотіків (v121): Слотіки, куплене й лічильники предметів
    // змінює лише сервер (lib/shop.js, api/play.js, api/round.js). Що надіто
    // (cosmetics) — сам гравець; показується лише те, що він справді купив.
    slotiky: adminOnly,
    slotikyItems: adminOnly,
    shopV2: adminOnly,
    shopSpins: adminOnly,
    shopFortune: adminOnly,
    freeFortune: adminOnly,
    minesHints: adminOnly,
    crashInsurance: adminOnly,
    lootboxInv: adminOnly,
    cosmetics: { ...userFieldOwner, $slot: v("newData.val() === false || (newData.isString() && newData.val().matches(/^[a-z_]{1,32}$/))") },
    banned: adminOnly,
    banReason: adminOnly,
    autoFrozen: adminOnly,
    isBot: adminOnly,
    // Значок «Підтримав проєкт» (донат) — ставить лише адмін/сервер, без ігрової цінності.
    supporter: adminOnly,
    supporterAt: adminOnly,
    tag: { ...adminOnly, ...userNode.tag },
    telegramChatId: { ".write": `auth != null && (auth.uid === $u || ${isAdmin}) && !newData.exists()` },
    // Інші легітимні записи в чужий акаунт (знайдено пошуком по app.js):
    // лічильники PvP/ботів, VIP-подарунок, вхідні перекази, записи історії.
    totalWins: increaseOnly("totalWins"),
    totalGames: increaseOnly("totalGames"),
    totalWagered: increaseOnly("totalWagered"),
    vipGiftUntil: increaseOnly("vipGiftUntil"),
    supportUnread: increaseOnly("supportUnread"),
    virtualCard: { ...userFieldOwner, totalIn: increaseOnly("totalIn") },
    history: { ...userFieldOwner, $h: { ".write": "auth != null && !data.exists()" } },
    cardTx: { ...userFieldOwner, $t: { ".write": "auth != null && !data.exists()" } },
    // Вступ до клану підтверджує власник/офіцер клану, тобто чужий гравець.
    clanId: { ".write": "auth != null" },
    // Відмітки «нагороду вже забрано» ставить сервер (api/reward.js).
    lastDailyBonus: adminOnly,
    dailyStreak: adminOnly,
    lastHourlyBonus: adminOnly,
    dailySpinDate: adminOnly,
    lastPlayedAt: adminOnly,
    welcomeBackAt: adminOnly,
    cashbackTotalClaimed: adminOnly,
    // Нагороди Battle Pass: власник може лише обнулити (новий сезон у addBpXP).
    bpClaimed: { ".write": `auth != null && ((auth.uid === $u && !newData.exists()) || ${isAdmin})` },
    bpBonusClaimed: { ".write": `auth != null && ((auth.uid === $u && newData.val() === 0) || ${isAdmin})` },
  });
  // Іменовані поля не підпадають під "$field", тож кожне поле без власного
  // .write (аватарки, email, …) явно віддаємо власнику.
  for (const [k, rule] of Object.entries(userNode)) {
    if (!k.startsWith(".") && k !== "$field" && !(".write" in rule)) userNode[k] = { ...userFieldOwner, ...rule };
  }

  const rules = {
    ".read": false,
    ".write": false,

    // Профілі: бачать лише залогінені гравці (рейтинги, картка гравця, ПМ).
    users: {
      ".read": authed,
      ".write": isAdmin,
      ".indexOn": ["totalWagered", "totalWins", "totalProfit", "lastSeen", "stats/gamesPlayed", "stats/biggestWin", "isBot", "role", "flagged", "isAdmin"],
      $u: userNode,
    },

    // ── Лише сервер (api/*, бот). Адмін-токен сервера правила оминає. ──
    bot_config: { ".read": false, ".write": false },
    // Хеші паролів/відповідей і дата народження (lib/secrets.js): ні читання,
    // ні запису з браузера — навіть адміну (скидання пароля — api/auth.js admin-reset).
    user_secrets: { ".read": false, ".write": false },
    // Приватні поля профілю: лише власник і адмін (lib/private-profile.js,
    // src/app/63-private-profile.js). Журнал безпеки (маскована IP) — теж тут.
    user_private: {
      ".read": false,
      ".write": false,
      $u: {
        ".read": owner("$u"),
        ".write": owner("$u"),
        ".validate": "newData.hasChildren() || !newData.exists()",
        email: v(safe(200)),
        lastIpHash: v(safe(64)),
        telegramChatId: v("newData.isString() || newData.isNumber()"),
        securityLog: { $e: {
          ".validate": "newData.hasChildren(['type', 'ts'])",
          type: v(safe(32)), details: v(str(200)), ts: v("newData.isNumber()"), ua: v(str(120)),
          $other: v("false"),
        } },
      },
    },
    // Індекс «хто з якого IP-хешу» для пошуку мультиакаунтів: бакет читає лише той,
    // чий це поточний хеш (user_private/<ти>/lastIpHash), або адмін; пише — кожен лише свій нік.
    ip_index: { ".read": false, ".write": false, $h: { ".read": `auth != null && (${isAdmin} || root.child('user_private').child(auth.uid).child('lastIpHash').val() === $h)`, $n: { ".write": owner("$n"), ".validate": "newData.isNumber()" } } },
    notify_rate: { ".read": false, ".write": false },
    // Журнал серверних раундів (api/play.js) — лише сервер.
    game_rounds: { ".read": false, ".write": false },
    // Стан раундів з кількома ходами (api/round.js): де міни, порядок колоди.
    game_sessions: { ".read": false, ".write": false },
    telegram_state: { ".read": false, ".write": false },
    promo_redemptions: { ".read": false, ".write": false },
    // Хто володіє Telegram-чатом, вирішує сервер; клієнт може лише відв'язати свій.
    telegram_links: { ".read": false, $chat: { ".write": "auth != null && !newData.exists() && data.val() === auth.uid" } },
    telegram_link_tokens: {
      ".read": false,
      $t: {
        ".write": "auth != null && !data.exists() && newData.exists()",
        ".validate": "newData.child('nick').val() === auth.uid",
        nick: v(safe(64)),
        createdAt: v("newData.isNumber()"),
      },
    },

    // ── Чати й соціальне (лише залогінені) ──
    lobby_chat: { ".read": authed, ".write": isAdmin, ".indexOn": ["time"], $m: { ".write": chatWrite("sender"), ...chatMessage(["sender"]) } },
    global_chat: { ".read": authed, ".indexOn": ["ts"], $m: { ".write": chatWrite("user"), ...chatMessage(["user"]) } },
    chat_rate: {
      ".read": false,
      $u: { ".write": onlyMe("$u"), ".validate": "newData.isNumber() && newData.val() === now" },
    },
    clan_chats: { ".read": authed, $c: { $m: { ".write": ownEntry("user"), ...chatMessage(["user", "sender"]) } } },
    // ПМ: скриньку pm/<нік> читає лише її власник (і адмін). Писати в чужу
    // скриньку — лише нове повідомлення від свого імені (from === auth.uid) і
    // лише якщо тебе не заблоковано. Службові повідомлення з довільним from
    // («📥 Система», «💬 Підтримка») гравець може класти лише адміну; іншим
    // гравцям їх пише адмін/support або сервер.
    pm: { ".read": false, $u: {
      ".read": owner("$u"),
      $m: {
        ".write": `auth != null && (auth.uid === $u || ${isSupport} || (!data.exists() && newData.exists() && !root.child('users').child($u).child('blocked').child(auth.uid).exists()` +
          ` && (newData.child('from').val() === auth.uid || $u === '${OWNER}' || root.child('users').child($u).child('isAdmin').val() === true)))`,
        ...chatMessage(["from", "to"]),
      },
    } },
    support_chats: {
      ".read": isAdmin,
      $u: { ".read": owner("$u"), $m: { ".write": owner("$u"), ...chatMessage(["sender"]) } },
    },
    casino_news: {
      ".read": authed,
      ".write": isAdmin,
      $n: {
        ".write": isAdmin,
        ...NICK_FIELDS(["author", "category", "emoji"]),
        ...AVATAR_FIELDS,
        // Лічильники реакцій і коментарів: +1 від будь-якого залогіненого, вниз — лише адмін.
        reactions: { $r: { ".write": increaseOnlyNum } },
        myReaction: { ".write": authed },
        commentCount: { ".write": increaseOnlyNum },
        comments: { $c: { ".write": ownEntry("author"), ...NICK_FIELDS(["author"]), ...AVATAR_FIELDS, ...TEXT(2000) } },
      },
    },
    // Стрічка виграшів — єдине, що видно на екрані входу (нік, гра, сума).
    win_feed: { ".read": true, ".indexOn": ["ts", "time"], $k: { ".write": ownEntry("user") } },
    // Хто зараз онлайн: кожен ставить/знімає лише свою позначку.
    online: { ".read": authed, $u: { ".write": onlyMe("$u") } },
    clans: clientShared(),
    // Мітка авто-очищення лобі-чату — лише адмін (initChatAutoClear).
    chat_meta: adminNode(),

    // ── Ігри, PvP, турніри ──
    mp_rooms: clientShared(),
    card_rooms: clientShared(),
    pvp_rps: clientShared(),
    pvp_predict: clientShared(),
    pvp_chess: clientShared(),
    pvp_coinflip: clientShared(),
    // Онлайн-кімнати (api/room.js): пише лише сервер. Повний стан —
    // room_state/room_of/room_paid — правил не має, тобто закритий для браузера.
    rooms: { ".read": authed, ".write": false, $game: { ".indexOn": ["status"] } },
    // Щоденні місії (lib/missions.js): гравець бачить лише свій вузол, пише сервер.
    missions: { ".read": false, ".write": false, $u: { ".read": onlyMe("$u") } },
    // Рейтингові ліги (lib/leagues.js): особистий вузол читає власник, таблиця сезону — залогінені.
    league: { ".read": false, ".write": false, $u: { ".read": onlyMe("$u") } },
    league_pub: { ".read": false, ".write": false, $season: { ".read": authed, ".indexOn": ["rating"] } },
    room_private: { ".read": false, ".write": false, $id: { $nick: { ".read": onlyMe("$nick") } } },
    // Глядачі столу (src/app/59-spectate.js): кожен пише лише свій ключ, число бачать залогінені.
    room_watchers: { ".read": authed, ".write": false, $id: { $nick: { ".write": onlyMe("$nick"), ".validate": "newData.isNumber()" } } },
    // Друзі й запрошення за стіл (lib/friends.js): пише лише сервер, кожен читає свої списки.
    friends: { ".read": false, ".write": false, $u: { ".read": onlyMe("$u") } },
    friend_requests: { ".read": false, ".write": false, $u: { ".read": onlyMe("$u") } },
    room_invites: { ".read": false, ".write": false, $u: { ".read": onlyMe("$u") } },
    // Спільні ігри за розкладом (api/live.js) і глобальна рулетка: пише лише сервер.
    live_bets: serverOnly(),
    live_results: serverOnly(),
    live_crash: serverOnly(),
    global_roulette: serverOnly(),
    // Рекорди соло-Сапера: кожен пише лише свій рядок, кращий час — число секунд
    minesweeper_records: {
      ".read": authed,
      $level: { ".indexOn": ["t"], $nick: { ".write": onlyMe("$nick"), t: v("newData.isNumber() && newData.val() > 0 && newData.val() < 100000") } },
    },
    // Ставки на спорт прибрано. Вузол лишився лише для одноразового повернення
    // відкритих ставок (src/app/27-sports.js): нових ставок писати не можна,
    // власник може лише перевести СВОЮ pending-ставку в refunded.
    sport_bets: {
      ".read": authed,
      ".indexOn": ["userId"],
      $b: {
        status: { ".write": "auth != null && data.val() === 'pending' && newData.val() === 'refunded' && data.parent().child('userId').val() === auth.uid" },
        refundedAt: { ".write": "auth != null && !data.exists() && data.parent().child('userId').val() === auth.uid" },
      },
    },
    // Турніри створює адмін; бали — кожен лише свої.
    tournaments: adminNode(),
    tournament_scores: { ".read": authed, $t: { ".write": isAdmin, $u: { ".write": owner("$u"), ".validate": "newData.isNumber()" } } },
    // Денні/тижневі рейтинги: кожен пише лише свій рядок.
    leaderboards: { ".read": authed, $period: { ".write": isAdmin, $u: { ".write": owner("$u") } } },
    leaderboard_weekly: adminNode(),
    // Лотерея: квиток — лише на себе; пул — лише зростає; розіграш — адмін.
    lottery: {
      ".read": authed,
      ".write": isAdmin,
      $week: {
        tickets: { $t: { ".write": `auth != null && !data.exists() && newData.child('user').val() === auth.uid` } },
        pool: { ".write": increaseOnlyNum },
      },
    },
    lottery_history: adminNode(),
    // Джекпот: кожна ставка додає частку (лише зростання); виплату/обнулення робить адмін.
    jackpot: { ".read": authed, ".write": isAdmin, amount: { ".write": increaseOnlyNum } },
    // Загальна сума ставок — рахує адмін, показується на екрані входу.
    casino_stats: { ".read": true, ".write": isAdmin },
    casino_events: adminNode(),
    // Інвест-пул: свій внесок — лише власник; загальна сума — будь-який залогінений
    // (вивід зменшує її) — справжній захист лише на сервері, див. ROADMAP.md.
    investPool: { ".read": authed, ".write": isAdmin, total: { ".write": authed, ".validate": "newData.isNumber()" }, investors: { $u: { ".write": owner("$u") } } },
    p2p_loans: adminNode(),

    // ── Звернення: питання, скарги, пропозиції, скарги на гравців з ПМ ──
    feedback: feedbackNode(isAdmin, isSupport),

    // ── Заявки: створює гравець (скидання пароля — сервер), статус міняє адмін або сервер ──
    deposit_requests: requestNode(isAdmin),
    withdraw_requests: requestNode(isAdmin),
    password_reset_requests: requestNode(isAdmin, false),

    // ── Адмінське ── (налаштування читають лише залогінені гравці)
    site_config: adminNode(),
    settings: adminNode(),
    admin_settings: adminNode(),
    announcement: adminNode(),
    changelog: adminNode({ ".indexOn": ["date", "version"] }),
    // Промокоди: список бачить лише адмін; конкретний код гравець перевіряє
    // в activatePromo() (src/app/13-misc.js) — тож його читання лишається.
    promos: { ".read": isAdmin, ".write": isAdmin, $code: { ".read": authed } },
    admin_notes: { ".read": isAdmin, ".write": isAdmin },
    admin_action_log: { ".read": isAdmin, $e: { ".write": `${isAdmin} && !data.exists()` } },
    anti_cheat_flags: { ".read": isAdmin, ".write": isAdmin, $u: { $f: { ".write": owner("$u") } } },
  };
  return { rules };
}

// Звернення: створює гравець від свого імені (лише зі статусом new і без
// відповіді), читає — свої (запитом orderByChild('uid').equalTo(<нік>)) або
// всі, якщо support/admin. Статус і відповідь міняє лише support/admin.
// Фаза 1 не знає, хто пише, — там лише перевірка формату.
function feedbackNode(isAdmin, isSupport) {
  const fields = {
    uid: v(safe(64)),
    role: v("newData.isString() && newData.val().matches(/^(player|support|admin)$/)"),
    type: v("newData.isString() && newData.val().matches(/^(question|complaint|suggestion|report)$/)"),
    subject: v(str(120)),
    message: v(str(4000)),
    contact: v(str(200)),
    createdAt: v("newData.isNumber()"),
    status: v("newData.isString() && newData.val().matches(/^(new|in_progress|closed)$/)"),
    reply: v(str(4000)),
    reply_at: v("newData.isNumber()"),
    reply_by: v(safe(64)),
    reportedUser: v(safe(64)),
    evidence: { $i: v(str(400)) },
    // Скрін стискається в браузері; 3 млн символів base64 ≈ 2.2 МБ.
    imgUrl: v(`newData.isString() && newData.val().length <= 3000000 && newData.val().matches(/^data:image\\/(png|jpeg|webp|gif);base64,/)`),
    $other: v("false"),
  };
  const validate = "newData.hasChildren(['uid', 'type', 'message', 'createdAt', 'status'])";
  const staff = { ".write": isSupport };
  return {
    ".read": `${isSupport} || (auth != null && query.orderByChild === 'uid' && query.equalTo === auth.uid)`,
    ".indexOn": ["uid", "status", "createdAt"],
    $id: {
      ".read": "auth != null && data.child('uid').val() === auth.uid",
      ".write": `${isAdmin} || (!data.exists() && auth != null && newData.child('uid').val() === auth.uid && newData.child('status').val() === 'new' && !newData.child('reply').exists())`,
      ".validate": validate,
      ...fields,
      status: { ...staff, ...fields.status },
      reply: { ...staff, ...fields.reply },
      reply_at: { ...staff, ...fields.reply_at },
      reply_by: { ".write": isSupport, ".validate": `${safe(64)} && newData.val() === auth.uid` },
    },
  };
}

function requestNode(isAdmin, playerCreate = true) {
  // Створити заявку може гравець від свого імені (заявку на скидання пароля
  // створює лише сервер — api/auth.js reset-request),
  // змінювати існуючу (підтвердити/відхилити) — лише адмін або сервер.
  return {
    // Гравець бачить лише власні заявки — і лише запитом orderByChild('user').equalTo(<свій нік>).
    ".read": `${isAdmin} || (auth != null && query.orderByChild === 'user' && query.equalTo === auth.uid)`,
    ".indexOn": ["user", "status"],
    $id: {
      ".read": `auth != null && data.child('user').val() === auth.uid`,
      ".write": `${isAdmin} || (${playerCreate ? "!data.exists() && auth != null && newData.child('user').val() === auth.uid" : "false"}) || (data.exists() && auth != null && data.child('user').val() === auth.uid && newData.child('status').val() === 'cancelled')`,
      user: v(safe(64)),
      amount: v("newData.isNumber() && newData.val() > 0 && newData.val() < 1000000000000"),
    },
  };
}

const ROOT = path.join(__dirname, "..");
const outputs = {
  "database.rules.json": build(),
};
const REMOVED = ["database.rules.strict.json"]; // друга версія правил — більше не існує

if (require.main === module) {
  const check = process.argv.includes("--check");
  let stale = false;
  for (const [file, data] of Object.entries(outputs)) {
    const text = JSON.stringify(data, null, 2) + "\n";
    const full = path.join(ROOT, file);
    if (check) {
      if (!fs.existsSync(full) || fs.readFileSync(full, "utf8") !== text) {
        console.error(`${file} застарів — запусти: node scripts/build-rules.js`);
        stale = true;
      }
    } else {
      fs.writeFileSync(full, text);
      console.log("wrote", file);
    }
  }
  for (const file of REMOVED) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    if (check) { console.error(`${file} не має існувати — запусти: node scripts/build-rules.js`); stale = true; }
    else { fs.unlinkSync(full); console.log("removed", file); }
  }
  if (stale) process.exit(1);
}

module.exports = { build, outputs };
