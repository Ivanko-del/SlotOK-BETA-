import { evaluateAccess, isAdminAccount } from '../src/services/access';

const now = 1_000_000;

describe('evaluateAccess', () => {
  it('немає запису → missing', () => {
    expect(evaluateAccess('a', null, false, now)).toMatchObject({ ok: false, kind: 'missing' });
  });
  it('бан з причиною', () => {
    const v = evaluateAccess('a', { banned: true, banReason: 'чіти' }, false, now);
    expect(v).toMatchObject({ ok: false, kind: 'banned' });
    expect((v as any).message).toContain('чіти');
  });
  it('активне самовиключення: показує скільки годин лишилось', () => {
    const v = evaluateAccess('a', { selfExcluded: true, selfExcludeUntil: now + 3 * 3600000 }, false, now);
    expect(v).toMatchObject({ ok: false, kind: 'selfExcluded' });
    expect((v as any).message).toContain('3 год');
  });
  it('закінчене самовиключення пропускає і просить зняти прапорець', () => {
    expect(evaluateAccess('a', { selfExcluded: true, selfExcludeUntil: now - 1 }, false, now)).toEqual({
      ok: true,
      clearSelfExclusion: true,
    });
  });
  it('самовиключення без дати знімається, як у старому (блок лише за майбутньою датою)', () => {
    expect(evaluateAccess('a', { selfExcluded: true }, false, now)).toEqual({ ok: true, clearSelfExclusion: true });
  });
  it('техобслуговування блокує звичайного гравця, але не адміна', () => {
    expect(evaluateAccess('a', {}, true, now)).toMatchObject({ ok: false, kind: 'maintenance' });
    expect(evaluateAccess('a', { isAdmin: true }, true, now)).toMatchObject({ ok: true });
    expect(evaluateAccess('TheIvankoo', {}, true, now)).toMatchObject({ ok: true });
  });
  it('isAdminAccount', () => {
    expect(isAdminAccount('theivankoo', {})).toBe(true);
    expect(isAdminAccount('x', { isAdmin: true })).toBe(true);
    expect(isAdminAccount('x', {})).toBe(false);
  });
});
