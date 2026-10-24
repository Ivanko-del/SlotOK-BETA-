// Дзеркало VIP_LEVELS з app.js. Розбіжність виловлює tests/parity.test.ts.
export interface VipLevel {
  name: string;
  icon: string;
  min: number;
  dailyMult: number;
}

export const VIP_LEVELS: VipLevel[] = [
  { name: 'Iron', icon: '⚙️', min: 0, dailyMult: 1.0 },
  { name: 'Bronze', icon: '🥉', min: 1000, dailyMult: 1.0 },
  { name: 'Silver', icon: '🥈', min: 5000, dailyMult: 1.1 },
  { name: 'Gold', icon: '🥇', min: 20000, dailyMult: 1.25 },
  { name: 'Emerald', icon: '💚', min: 60000, dailyMult: 1.4 },
  { name: 'Sapphire', icon: '💙', min: 150000, dailyMult: 1.6 },
  { name: 'Ruby', icon: '❤️', min: 350000, dailyMult: 1.75 },
  { name: 'Platinum', icon: '💎', min: 700000, dailyMult: 1.9 },
  { name: 'Master', icon: '🔮', min: 1500000, dailyMult: 2.0 },
  { name: 'Elite', icon: '⭐', min: 3000000, dailyMult: 2.2 },
  { name: 'Diamond', icon: '💠', min: 7000000, dailyMult: 2.5 },
  { name: 'Legend', icon: '🌟', min: 15000000, dailyMult: 3.0 },
  { name: 'Mythic', icon: '🔱', min: 35000000, dailyMult: 3.5 },
  { name: 'Supreme', icon: '👑', min: 100000000, dailyMult: 5.0 },
];

export function getVipLevel(wagered: number): VipLevel & { index: number } {
  for (let i = VIP_LEVELS.length - 1; i >= 0; i--) {
    if (wagered >= VIP_LEVELS[i].min) return { ...VIP_LEVELS[i], index: i };
  }
  return { ...VIP_LEVELS[0], index: 0 };
}

/** Відсоток шляху до наступного рівня (як renderHomeProgressBars у app.js). */
export function vipProgress(wagered: number): { level: ReturnType<typeof getVipLevel>; pct: number } {
  const level = getVipLevel(wagered);
  const hasNext = level.index < VIP_LEVELS.length - 1;
  const next = VIP_LEVELS[Math.min(level.index + 1, VIP_LEVELS.length - 1)];
  const pct = hasNext
    ? Math.min(100, Math.round(((wagered - level.min) / (next.min - level.min || 1)) * 100))
    : 100;
  return { level, pct };
}
