// Temporary PWA shutdown: unregister this worker and clear all Cache Storage.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    await self.registration.unregister();

    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clientList.map((client) => client.navigate('https://www.petmol.com.br/login?reset=1')));
  })());
});
