// SNR-PMO service worker — safe & self-healing.
// Network-first for all HTML/navigation so the app is NEVER served stale while
// online; cache-first only for immutable content-hashed build assets; clears
// old caches on activate so a bad cache can't persist.
const CACHE = 'snrpmo-v2';
const STATIC = /\/_next\/static\//;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try { const c = await caches.open(CACHE); await c.add('/offline.html'); } catch (_e) { /* ignore */ }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE ? Promise.resolve() : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch (_e) { return; }
  // Only same-origin GET; never touch API/auth or cross-origin (Supabase).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;

  // Immutable hashed build assets: cache-first (safe — content-addressed).
  if (STATIC.test(url.pathname)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    })());
    return;
  }

  // Everything else (HTML, navigations, data): NETWORK-FIRST.
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (_e) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') { const off = await caches.match('/offline.html'); if (off) return off; }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
