export interface Db {
  get<T = any>(path: string): Promise<T | null>;
  set(path: string, value: unknown): Promise<void>;
  /** Багатошляховий запис від кореня; значення null видаляє вузол. */
  update(updates: Record<string, unknown>): Promise<void>;
  push(path: string, value: unknown): Promise<string>;
  /** Створює вузол лише якщо його ще немає (транзакція). true — створено. */
  createIfAbsent(path: string, value: unknown): Promise<boolean>;
  increment(path: string, by: number): Promise<void>;
  subscribe<T = any>(path: string, cb: (v: T | null) => void): () => void;
  /** Останні n дочірніх елементів, відсортованих за полем orderBy (за зростанням). */
  subscribeLast<T = any>(path: string, orderBy: string, n: number, cb: (items: T[]) => void): () => void;
  /** Ніки перших limit акаунтів з isAdmin === true. */
  adminNicks(limit: number): Promise<string[]>;
}

let current: Db | null = null;

export function setDb(db: Db): void {
  current = db;
}

export function getDb(): Db {
  if (!current) throw new Error('Db не ініціалізовано');
  return current;
}
