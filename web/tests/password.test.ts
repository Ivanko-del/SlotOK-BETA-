import { SlotOKPassword as P } from '../src/lib/password';

describe('SlotOKPassword (обгортка над кореневим password.js)', () => {
  it('хешує у форматі pbkdf2$ і перевіряє пароль', async () => {
    const stored = await P.hash('секрет-123');
    expect(stored.startsWith('pbkdf2$')).toBe(true);
    expect((await P.verify('секрет-123', stored)).ok).toBe(true);
    expect((await P.verify('інший', stored)).ok).toBe(false);
  });

  it('приймає спадковий SHA-256 і просить оновлення', async () => {
    const legacy = await (async () => {
      const data = new TextEncoder().encode('старий');
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    })();
    const r = await P.verify('старий', legacy);
    expect(r).toEqual({ ok: true, needsUpgrade: true });
  });
});
