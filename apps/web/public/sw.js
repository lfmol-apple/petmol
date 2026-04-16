/**
 * PETMOL Service Worker — Web Push
 * v2026.04.09c
 *
 * Recebe eventos push, exibe notificação e ao clicar abre a URL do payload.
 * Payload esperado (JSON):
 * {
 *   title:   string,
 *   body:    string,
 *   icon:    string,
 *   badge:   string,
 *   tag:     string,
 *   data:    { url: string },
 *   requireInteraction: boolean,
 *   autoCloseMs: number,
 * }
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PETMOL', body: event.data.text() };
  }

  const title = payload.title || 'PETMOL';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/badge-mono.png',
    tag: payload.tag || 'petmol',
    data: payload.data || { url: '/home' },
    requireInteraction: payload.requireInteraction === true,
  };

  const notifPromise = self.registration.showNotification(title, options);

  if (payload.autoCloseMs && payload.autoCloseMs > 0 && !payload.requireInteraction) {
    event.waitUntil(
      notifPromise.then(() =>
        new Promise((resolve) => setTimeout(resolve, payload.autoCloseMs))
          .then(() =>
            self.registration.getNotifications({ tag: options.tag }).then((notifs) => {
              notifs.forEach((notification) => notification.close());
            })
          )
      )
    );
  } else {
    event.waitUntil(notifPromise);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/home';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/_next/') &&
    (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html'))
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
