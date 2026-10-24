export const START_COINS = 1000;
export const START_SPINS = 10;

export const PROMOS: Record<string, { coins: number; spins: number; msg: string }> = {
  SLOTOK: { coins: 500, spins: 5, msg: ' +500₴ промокод!' },
  VIP: { coins: 2000, spins: 0, msg: ' +2000₴ VIP!' },
};

/** Поля, які старий authRegister кладе в users/{нік}; usedPromo і referredBy додаються за потреби. */
export const NEW_USER_KEYS = [
  'pass', 'email', 'securityQuestion', 'securityAnswerHash', 'balance', 'freeSlots', 'id', 'tag', 'avatar',
  'dailyStreak', 'luckyGamesLeft', 'luckyGamesUsed', 'registeredAt', 'lastSeen',
  'totalGames', 'totalWins', 'totalWagered', 'slotsPlayed',
];

export interface NewUserInput {
  passHash: string;
  secAnswerHash: string;
  email: string;
  secQuestion: string;
  promo: string;
  refBy: string | null;
  nick: string;
  now: number;
  rand: () => number;
}

export function buildNewUser(i: NewUserInput) {
  let bonus = START_COINS;
  let spins = START_SPINS;
  let bonusMsg = '';
  const promo = PROMOS[i.promo];
  if (promo) {
    bonus += promo.coins;
    spins += promo.spins;
    bonusMsg = promo.msg;
  }
  const user: Record<string, unknown> = {
    pass: i.passHash,
    email: i.email || '',
    securityQuestion: i.secQuestion,
    securityAnswerHash: i.secAnswerHash,
    balance: bonus,
    freeSlots: spins,
    id: Math.floor(i.rand() * 900000) + 100000,
    tag: 'Новачок 🌱',
    avatar: '👤',
    dailyStreak: 0,
    luckyGamesLeft: 3,
    luckyGamesUsed: 0,
    registeredAt: i.now,
    lastSeen: i.now,
    totalGames: 0,
    totalWins: 0,
    totalWagered: 0,
    slotsPlayed: 0,
  };
  if (i.promo) user.usedPromo = i.promo;
  if (i.refBy && i.refBy !== i.nick) user.referredBy = i.refBy;
  return { user, bonus, spins, bonusMsg };
}
