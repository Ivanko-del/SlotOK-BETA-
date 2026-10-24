import { beforeEach, describe, expect, it } from 'vitest';
import { captureRef, clearRef, getSession, REF_KEY, SESSION_KEY, takeRef } from '../src/services/session';

beforeEach(() => localStorage.clear());

describe('captureRef', () => {
  it('зберігає валідний ref для гостя', () => {
    captureRef('?ref=Friend', false);
    expect(takeRef()).toBe('Friend');
  });
  it('ігнорує ref, коли є сесія', () => {
    captureRef('?ref=Friend', true);
    expect(takeRef()).toBeNull();
  });
  it('ігнорує небезпечні й некоректні значення', () => {
    captureRef('?ref=a/b', false);
    captureRef('?ref=', false);
    captureRef('?ref=' + 'x'.repeat(41), false);
    expect(localStorage.getItem(REF_KEY)).toBeNull();
  });
  it('takeRef/clearRef', () => {
    captureRef('?ref=Friend', false);
    expect(takeRef()).toBe('Friend');
    clearRef();
    expect(takeRef()).toBeNull();
  });
});

describe('getSession', () => {
  it('мігрує royal_online_user у slotok_user і прибирає старий ключ', () => {
    localStorage.setItem('royal_online_user', 'Old');
    expect(getSession()).toBe('Old');
    expect(localStorage.getItem(SESSION_KEY)).toBe('Old');
    expect(localStorage.getItem('royal_online_user')).toBeNull();
  });
});
