/**
 * PETMOL Service Worker — Web Push
 * v2026.04.23.1
 *
 * Política de paridade desktop/mobile:
 * - Não manter cache de navegação HTML no SW.
 * - Atualização agressiva do SW (skipWaiting + claim + limpeza de caches antigos).
 */
const SW_VERSION = '2026.04.23.1';
const RUNTIME_CACHE_PREFIX = 'petmol-sw-';
const RUNTIME_CACHE_NAME = `${RUNTIME_CACHE_PREFIX}${SW_VERSION}`;

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PETMOL', body: event.data.text() };
  }

  const normalized = normalizePushPayload(payload);
  const title = normalized.title;
  const options = {
    body: normalized.body,
    icon: normalized.icon,
    badge: normalized.badge,
    image: normalized.image,
    tag: normalized.tag,
    data: normalized.data,
    requireInteraction: normalized.requireInteraction === true,
    renotify: normalized.renotify === true,
  };

  const notifPromise = self.registration.showNotification(title, options);

  if (normalized.autoCloseMs && normalized.autoCloseMs > 0 && !normalized.requireInteraction) {
    event.waitUntil(
      notifPromise.then(() =>
        new Promise((resolve) => setTimeout(resolve, normalized.autoCloseMs))
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

function normalizePushPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const sourceData = source.data && typeof source.data === 'object' ? source.data : {};
  const rawTitle = String(source.title || '').trim();
  const rawBody = String(source.body || '').trim();
  const url = String(sourceData.url || source.url || '/home').trim() || '/home';

  const titleBase = rawTitle || 'PETMOL';
  const title = titleBase.startsWith('🐾') ? titleBase : `🐾 ${titleBase}`;

  let autoCloseMs = Number(source.autoCloseMs || 0);
  if (!Number.isFinite(autoCloseMs) || autoCloseMs < 0) autoCloseMs = 0;

  const requireInteraction = source.requireInteraction === true;
  if (requireInteraction) autoCloseMs = 0;

  return {
    title,
    body: rawBody,
    icon: String(source.icon || '/icons/icon-192x192.png'),
    badge: String(source.badge || '/icons/badge-mono.png'),
    image: String(source.image || '/brand/notification-banner.png'),
    tag: String(source.tag || 'petmol'),
    data: { url },
    requireInteraction,
    autoCloseMs,
    renotify: source.renotify === true,
  };
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url || '/home';
  const targetUrl = normalizeNotificationClickUrl(rawUrl);

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client && 'navigate' in client) {
            return client.focus().then(() => client.navigate(targetUrl));
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

function normalizeNotificationClickUrl(rawUrl) {
  try {
    const normalized = new URL(String(rawUrl || '/home'), self.location.origin);
    if (normalized.origin !== self.location.origin) return `${self.location.origin}/home`;
    return normalized.toString();
  } catch {
    return `${self.location.origin}/home`;
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(RUNTIME_CACHE_PREFIX) && key !== RUNTIME_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => clients.claim()).then(() =>
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => {
          try { client.navigate(client.url); } catch (_) {}
        });
      })
    )
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/_next/') &&
    (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html'))
  ) {
    event.respondWith(fetch(event.request));
  }
});
