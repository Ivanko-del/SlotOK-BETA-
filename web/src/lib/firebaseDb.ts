import { getApps, initializeApp } from 'firebase/app';
import {
  equalTo, get, getDatabase, increment, limitToFirst, limitToLast, onValue,
  orderByChild, push, query, ref, runTransaction, set, update,
} from 'firebase/database';
import type { Db } from './db';

// Публічний клієнтський конфіг того самого проєкту, що й у app.js.
const firebaseConfig = {
  apiKey: 'AIzaSyBQelUmnWpgdjV_Y22GBjjZZPxUb85PUuI',
  authDomain: 'nye-slotok.firebaseapp.com',
  databaseURL: 'https://nye-slotok-default-rtdb.firebaseio.com',
  projectId: 'nye-slotok',
  storageBucket: 'nye-slotok.firebasestorage.app',
  messagingSenderId: '436174740835',
  appId: '1:436174740835:web:b70e8467396e9f983ac756',
};

export function createFirebaseDb(): Db {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const d = getDatabase(app);

  return {
    async get(path) {
      const snap = await get(ref(d, path));
      return snap.exists() ? snap.val() : null;
    },
    async set(path, value) {
      await set(ref(d, path), value);
    },
    async update(updates) {
      await update(ref(d), updates);
    },
    async push(path, value) {
      const r = push(ref(d, path));
      await set(r, value);
      return r.key as string;
    },
    async createIfAbsent(path, value) {
      const res = await runTransaction(ref(d, path), (cur) => (cur === null ? (value as any) : undefined));
      return res.committed;
    },
    async increment(path, by) {
      await set(ref(d, path), increment(by));
    },
    subscribe(path, cb) {
      return onValue(ref(d, path), (snap) => cb(snap.exists() ? snap.val() : null));
    },
    subscribeLast(path, orderBy, n, cb) {
      const q = query(ref(d, path), orderByChild(orderBy), limitToLast(n));
      return onValue(q, (snap) => {
        const items: any[] = [];
        snap.forEach((child) => {
          items.push(child.val());
        });
        cb(items);
      });
    },
    async adminNicks(limit) {
      const q = query(ref(d, 'users'), orderByChild('isAdmin'), equalTo(true), limitToFirst(limit));
      const snap = await get(q);
      return Object.keys(snap.val() ?? {});
    },
  };
}
