export const BP_XP_PER_LEVEL = 1000;
export const BP_SEASON_EPOCH = Date.UTC(2026, 0, 1);
export const BP_SEASON_DAYS = 30;

export function getBpSeasonNum(now: number): number {
  return Math.floor((now - BP_SEASON_EPOCH) / (BP_SEASON_DAYS * 86400000)) + 1;
}

/** Як getBpData + renderHomeProgressBars: дані минулого сезону вважаються нульовими. */
export function getBpProgress(
  user: { bpSeason?: number; bpXP?: number; bpLevel?: number },
  now: number,
): { level: number; pct: number } {
  const stale = user.bpSeason != null && user.bpSeason !== getBpSeasonNum(now);
  const xp = stale ? 0 : user.bpXP || 0;
  const level = stale ? 0 : user.bpLevel || 0;
  return { level, pct: Math.min(100, Math.round(((xp % BP_XP_PER_LEVEL) / BP_XP_PER_LEVEL) * 100)) };
}
