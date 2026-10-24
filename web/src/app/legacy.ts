/** Посилання на екран старого сайту; його app.js розбирає ?tab= у handleV2Link (див. Step 4). */
export function legacyUrl(tab: string): string {
  return '/?tab=' + encodeURIComponent(tab);
}

export const LEGACY_GAMES = [
  { id: 'slots', title: 'Слоти', emoji: '🎰' },
  { id: 'crash', title: 'Краш', emoji: '🚀' },
  { id: 'mines', title: 'Майнер', emoji: '💣' },
  { id: 'plinko', title: 'Плінко', emoji: '🔵' },
  { id: 'tower', title: 'Вежа', emoji: '🗼' },
  { id: 'hilo', title: 'Hi-Lo', emoji: '🃏' },
  { id: 'dice', title: 'Кості', emoji: '🎲' },
  { id: 'roulette', title: 'Рулетка', emoji: '🎡' },
];
