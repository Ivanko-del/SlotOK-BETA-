// No offline caching / fetch interception on purpose — the app is fully
// dynamic (Firebase-backed), so an offline cache would just serve stale
// data. This worker exists only to receive and display push notifications
// while the app isn't open (see requestPushPermission() in app.js for token
// registration, and lib/fcm.js for the server-side send).
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  const notification = payload.notification || {};
  const title = notification.title || '🎰 SlotOK Casino';
  const options = {
    body: notification.body || '',
    icon: notification.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
