// Генерує правила Firebase Realtime Database:
//   database.rules.json         — фаза 1: розгортається, щойно на Vercel задано
//                                 FIREBASE_SERVICE_ACCOUNT_KEY (сервер тоді ходить
//                                 у базу з адмін-токеном і правила його не стосуються).
//                                 Клієнт ще без Firebase Auth, тож правила не знають,
//                                 хто пише, — але закривають серверні вузли, корінь,
//                                 видалення цілих колекцій і перевіряють типи/формат.
//   database.rules.strict.json  — фаза 2: після того як гравці входять через
//                                 api/auth.js (auth.uid = нік). Писати у свій акаунт
//                                 може лише власник; поля адмінки — лише адмін.
//
// Запуск: node scripts/build-rules.js        (перезаписує обидва файли)
//         node scripts/build-rules.js --check (лише перевіряє, що файли актуальні)
//
// Правила лежать у JSON без коментарів, тому пояснення — тут і в DEPLOY.md.

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

function build(strict) {
  const authed = strict ? "auth != null" : "true";
  const isAdmin = `(auth != null && (auth.uid === '${OWNER}' || root.child('users').child(auth.uid).child('isAdmin').val() === true))`;
  const admin = strict ? isAdmin : "true";
  const owner = (v_) => (strict ? `auth != null && (auth.uid === ${v_} || ${isAdmin})` : "true");
  // Запис лише на рівні елемента колекції: push()/update() працюють як і
  // раніше, а стерти чи перезаписати всю колекцію одним запитом — ні.
  const chatWrite = (senderField) => strict
    ? `auth != null && (${isAdmin}` +
      ` || (!data.exists() && newData.child('${senderField}').val() === auth.uid && newData.parent().parent().child('chat_rate').child(auth.uid).val() === now` +
      ` && (!root.child('chat_rate').child(auth.uid).exists() || root.child('chat_rate').child(auth.uid).val() < now - 2000))` +
      ` || (!newData.exists() && data.child('${senderField}').val() === auth.uid))`
    : "true";
  const openNode = (extra = {}) => ({ ".read": true, $k: { ".write": authed }, ...extra });
  const adminNode = (extra = {}) => ({ ".read": true, ".write": admin, ...extra });

  // users/$u — у фазі 1 запис дозволено на рівні $u (як і зараз), але не на
  // рівні всієї колекції: users.remove() / users.set({...}) більше не пройдуть.
  // У строгому режимі $u як ціле не пишеться ніким, крім адміна (реєстрацію
  // робить сервер), а кожне поле — власником; адмінські поля — лише адміном.
  const userFieldOwner = { ".write": owner("$u") };
  const adminOnly = { ".write": admin };
  const userNode = {
    ".validate": `data.exists() || ($u.length >= 2 && $u.length <= 32 && !$u.matches(${BAD}) && !$u.matches(/[ \\\\&%]/))`,
    balance: v(`newData.isNumber() && newData.val() < 1000000000000000 && (newData.val() >= 0 || (data.exists() && newData.val() >= data.val()))`),
    pass: v(str(300)),
    securityAnswerHash: v(str(300)),
    tag: v(safe(120)),
    bioInput: v(str(1000)),
    email: v(safe(200)),
    lastIP: v("false"), // відкриті IP у публічному вузлі більше не пишемо
    lastIpHash: v(safe(64)),
    ...AVATAR_FIELDS,
  };
  if (strict) {
    // Вхідні лічильники/зарахування від інших гравців (ПМ, реферали, виграш у
    // PvP, переказ): чужий гравець може лише ЗБІЛЬШИТИ значення.
    const increaseOnly = (f) => ({
      ".write": `auth != null && (auth.uid === $u || ${isAdmin} || (data.exists() ? newData.isNumber() && newData.val() >= data.val() : newData.isNumber() && newData.val() >= 0))`,
      ...(userNode[f] || {}),
    });
    Object.assign(userNode, {
      "$field": userFieldOwner,
      balance: increaseOnly("balance"),
      pmUnread: increaseOnly("pmUnread"),
      referrals: increaseOnly("referrals"),
      // Хеші паролів та відповідей змінює лише сервер (api/auth.js).
      pass: { ".write": "false", ...userNode.pass },
      securityAnswerHash: { ".write": "false", ...userNode.securityAnswerHash },
      isAdmin: adminOnly,
      adminPerms: adminOnly,
      banned: adminOnly,
      banReason: adminOnly,
      autoFrozen: adminOnly,
      isBot: adminOnly,
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
    });
    // Іменовані поля не підпадають під "$field", тож кожне поле без власного
    // .write (аватарки, email, …) явно віддаємо власнику.
    for (const [k, rule] of Object.entries(userNode)) {
      if (!k.startsWith(".") && k !== "$field" && !(".write" in rule)) userNode[k] = { ...userFieldOwner, ...rule };
    }
  } else {
    userNode[".write"] = true;
  }

  const rules = {
    ".read": false,
    ".write": false,

    users: {
      ".read": true,
      ".indexOn": ["totalWagered", "totalWins", "totalProfit", "lastSeen", "lastIpHash", "stats/gamesPlayed", "stats/biggestWin", "isBot"],
      ...(strict ? { ".write": isAdmin } : {}),
      $u: userNode,
    },

    // ── Лише сервер (api/*, бот). Адмін-токен сервера правила оминає. ──
    bot_config: { ".read": false, ".write": false },
    // Хеші паролів/відповідей (lib/secrets.js). Адмін у строгому режимі може
    // записати сюди тимчасовий пароль; прочитати — ніхто, крім сервера.
    user_secrets: { ".read": false, ".write": strict ? isAdmin : "false" },
    notify_rate: { ".read": false, ".write": false },
    // Журнал серверних раундів (api/play.js) — лише сервер.
    game_rounds: { ".read": false, ".write": false },
    // Стан раундів з кількома ходами (api/round.js): де міни, порядок колоди.
    game_sessions: { ".read": false, ".write": false },
    telegram_state: { ".read": false, ".write": false },
    promo_redemptions: { ".read": false, ".write": false },
    // Хто володіє Telegram-чатом, вирішує сервер; клієнт може лише відв'язати.
    telegram_links: { ".read": false, $chat: { ".write": strict ? `auth != null && !newData.exists() && data.val() === auth.uid` : "!newData.exists()" } },
    telegram_link_tokens: {
      ".read": false,
      $t: {
        ".write": "!data.exists() && newData.exists()",
        ".validate": strict ? "newData.child('nick').val() === auth.uid" : "newData.hasChildren(['nick', 'createdAt'])",
        nick: v(safe(64)),
        createdAt: v("newData.isNumber()"),
      },
    },

    // ── Чати й соціальне ──
    // Антиспам (строгий режим): нове повідомлення гравця проходить лише разом
    // з оновленням chat_rate/<нік> = now (postChatMessage в app.js), і лише якщо
    // попереднє було ≥ 2 с тому. Видалити можна лише своє; адмін — будь-що.
    lobby_chat: { ".read": true, ".write": admin, ".indexOn": ["time"], $m: { ".write": chatWrite("sender"), ...chatMessage(["sender"]) } },
    global_chat: { ".read": true, ".indexOn": ["ts"], $m: { ".write": chatWrite("user"), ...chatMessage(["user"]) } },
    chat_rate: {
      ".read": false,
      $u: { ".write": strict ? "auth != null && auth.uid === $u" : "true", ".validate": "newData.isNumber() && newData.val() === now" },
    },
    clan_chats: { ".read": true, $c: { $m: { ".write": authed, ...chatMessage(["user", "sender"]) } } },
    pm: { ".read": true, $u: { $m: { ".write": authed, ...chatMessage(["from", "to"]) } } },
    support_chats: {
      ".read": strict ? isAdmin : true,
      $u: { ".read": strict ? `auth != null && auth.uid === $u` : true, $m: { ".write": owner("$u"), ...chatMessage(["sender"]) } },
    },
    casino_news: {
      ".read": true,
      ".write": admin,
      $n: {
        ".write": admin,
        ...NICK_FIELDS(["author", "category", "emoji"]),
        ...AVATAR_FIELDS,
        reactions: { ".write": authed },
        myReaction: { ".write": authed },
        commentCount: { ".write": authed },
        comments: { $c: { ".write": authed, ...NICK_FIELDS(["author"]), ...AVATAR_FIELDS, ...TEXT(2000) } },
      },
    },
    win_feed: openNode({ ".indexOn": ["ts"] }),
    live_bets: openNode({ ".indexOn": ["ts"] }),
    online: openNode(),
    clans: openNode(),
    chat_meta: openNode(),

    // ── Ігри, PvP, турніри ──
    mp_rooms: openNode(),
    card_rooms: openNode(),
    pvp_rps: openNode(),
    pvp_predict: openNode(),
    pvp_chess: openNode(),
    pvp_coinflip: openNode(),
    global_roulette: openNode(),
    sport_bets: openNode(),
    sport_matches: openNode(),
    tournaments: openNode(),
    tournament_scores: openNode(),
    leaderboards: openNode(),
    leaderboard_weekly: openNode(),
    lottery: openNode(),
    lottery_history: openNode(),
    jackpot: openNode(),
    casino_stats: openNode(),
    casino_events: openNode(),
    investPool: openNode(),
    p2p_loans: openNode(),

    // ── Заявки: створює гравець, статус міняє адмін або сервер ──
    deposit_requests: requestNode(strict, isAdmin),
    withdraw_requests: requestNode(strict, isAdmin),
    password_reset_requests: requestNode(strict, isAdmin, true),

    // ── Адмінське ──
    site_config: adminNode(),
    settings: adminNode(),
    admin_settings: adminNode(),
    announcement: adminNode(),
    changelog: adminNode(),
    promos: adminNode(),
    admin_notes: { ".read": strict ? isAdmin : true, ".write": admin },
    admin_action_log: { ".read": strict ? isAdmin : true, $e: { ".write": strict ? `${isAdmin} && !data.exists()` : "!data.exists()" } },
    anti_cheat_flags: { ".read": strict ? isAdmin : true, ".write": admin, $u: { $f: { ".write": strict ? `auth != null && (auth.uid === $u || ${isAdmin})` : "true" } } },

    // ── Інтеграція з Аксіомою (окремий проєкт; вузли лишаються як були) ──
    axiomPublic: openNode(),
    axiomCardIndex: openNode(),
    axiomLinkCodes: openNode(),
  };
  return { rules };
}

function requestNode(strict, isAdmin, anonymousCreate = false) {
  if (!strict) return { ".read": true, ".indexOn": ["user", "status"], $id: { ".write": true } };
  // Створити заявку може гравець від свого імені (скидання пароля — і без входу),
  // змінювати існуючу (підтвердити/відхилити) — лише адмін або сервер.
  return {
    // Гравець бачить лише власні заявки — і лише запитом orderByChild('user').equalTo(<свій нік>).
    ".read": `${isAdmin} || (auth != null && query.orderByChild === 'user' && query.equalTo === auth.uid)`,
    ".indexOn": ["user", "status"],
    $id: {
      ".read": `auth != null && data.child('user').val() === auth.uid`,
      ".write": `${isAdmin} || (!data.exists() && ${anonymousCreate ? "true" : "auth != null && newData.child('user').val() === auth.uid"}) || (data.exists() && auth != null && data.child('user').val() === auth.uid && newData.child('status').val() === 'cancelled')`,
      user: v(safe(64)),
      amount: v("newData.isNumber() && newData.val() > 0 && newData.val() < 1000000000000"),
    },
  };
}

const ROOT = path.join(__dirname, "..");
const outputs = {
  "database.rules.json": build(false),
  "database.rules.strict.json": build(true),
};

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
  if (stale) process.exit(1);
}

module.exports = { build, outputs };
