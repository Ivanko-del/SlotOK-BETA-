import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// jsdom не завжди віддає crypto.subtle, а password.js без нього не працює.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
