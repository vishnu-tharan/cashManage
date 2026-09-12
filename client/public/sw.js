/* App shell only. API responses and private financial data are never cached here. */
const CACHE = 'cashmanage-shell-v1';
self.addEventListener('install', event => event.waitUntil((async () => {
 const response = await fetch('/'); const html = await response.clone().text();
 const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(m => m[1]);
 const cache = await caches.open(CACHE); await cache.addAll(['/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', ...assets]); await cache.put('/', response);
})()));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('cashmanage-shell-') && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
 if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/'))); return; }
 event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});

