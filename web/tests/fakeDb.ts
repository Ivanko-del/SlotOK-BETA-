import type { Db } from '../src/lib/db';

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const split = (p: string) => p.split('/').filter(Boolean);

/** In-memory підміна Firebase з тією самою семантикою, що й Db. */
export class FakeDb implements Db {
  data: Record<string, any> = {};
  /** Усі шляхи, записані через set/update/push/increment/createIfAbsent (для перевірок у тестах). */
  writes: string[] = [];
  private seq = 0;
  private listeners: Array<() => void> = [];

  read(path: string): any {
    let node: any = this.data;
    for (const k of split(path)) {
      if (node === null || typeof node !== 'object' || !(k in node)) return null;
      node = node[k];
    }
    return node === undefined ? null : clone(node);
  }

  private write(path: string, value: unknown): void {
    const keys = split(path);
    let node: any = this.data;
    for (const k of keys.slice(0, -1)) {
      if (node[k] === null || typeof node[k] !== 'object') node[k] = {};
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = clone(value);
    this.writes.push(path);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  async get<T = any>(path: string): Promise<T | null> {
    return this.read(path);
  }
  async set(path: string, value: unknown): Promise<void> {
    this.write(path, value);
    this.emit();
  }
  async update(updates: Record<string, unknown>): Promise<void> {
    for (const [p, v] of Object.entries(updates)) this.write(p, v);
    this.emit();
  }
  async push(path: string, value: unknown): Promise<string> {
    const key = '-k' + String(++this.seq).padStart(6, '0');
    this.write(`${path}/${key}`, value);
    this.emit();
    return key;
  }
  async createIfAbsent(path: string, value: unknown): Promise<boolean> {
    if (this.read(path) !== null) return false;
    this.write(path, value);
    this.emit();
    return true;
  }
  async increment(path: string, by: number): Promise<void> {
    this.write(path, (this.read(path) ?? 0) + by);
    this.emit();
  }
  subscribe<T = any>(path: string, cb: (v: T | null) => void): () => void {
    const run = () => cb(this.read(path));
    this.listeners.push(run);
    run();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== run);
    };
  }
  subscribeLast<T = any>(path: string, orderBy: string, n: number, cb: (items: T[]) => void): () => void {
    const run = () => {
      const node = this.read(path) ?? {};
      const items = Object.values(node) as any[];
      items.sort((a, b) => (a?.[orderBy] ?? 0) - (b?.[orderBy] ?? 0));
      cb(items.slice(-n) as T[]);
    };
    this.listeners.push(run);
    run();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== run);
    };
  }
  async adminNicks(limit: number): Promise<string[]> {
    const users = this.read('users') ?? {};
    return Object.keys(users).filter((k) => users[k]?.isAdmin === true).slice(0, limit);
  }
}
