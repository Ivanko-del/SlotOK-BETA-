// Той самий password.js, що й на старому сайті (кореневий файл), без копії.
// ?raw читає вихідний текст; UMD-обгортка бачить наш об'єкт `module` і віддає API через module.exports.
import source from '../../../password.js?raw';

export interface PasswordApi {
  hash(password: string): Promise<string>;
  verify(password: string, stored: unknown): Promise<{ ok: boolean; needsUpgrade: boolean }>;
  isModern(stored: unknown): boolean;
  ITERATIONS: number;
}

const mod: { exports: unknown } = { exports: {} };
new Function('module', 'exports', source)(mod, mod.exports);

export const SlotOKPassword = mod.exports as PasswordApi;
