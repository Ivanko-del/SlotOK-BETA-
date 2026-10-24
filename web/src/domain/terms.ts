export const TERMS_VERSION = '1';

export const TERMS_CHECKS = [
  { k: 'age', text: 'Мені виповнилось 14 років' },
  { k: 'noHack', text: 'Я не лізтиму в консоль, не змінюватиму код сайту й не намагатимусь його зламати' },
  { k: 'read', text: 'Я прочитав правила й погоджуюсь із ними' },
];

export function hasAcceptedTerms(user: { termsAcceptedAt?: number; termsVersion?: unknown } | null): boolean {
  return !!(user && user.termsAcceptedAt && String(user.termsVersion) === TERMS_VERSION);
}
