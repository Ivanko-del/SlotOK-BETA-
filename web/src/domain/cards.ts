/** Дзеркало _activeCardIdOf з app.js: id картки, що зараз «тримає» баланс. */
export function activeCardId(user: any): string | null {
  const ids: string[] = [];
  if (user?.virtualCard?.axiomLinked) ids.push('axiom');
  if (user?.linkedCards) ids.push(...Object.keys(user.linkedCards));
  if (!ids.length) return null;
  const a = user?.activeCardId;
  return a && ids.includes(a) ? a : ids[0];
}
