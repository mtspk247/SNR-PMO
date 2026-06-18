// SNR-PMO Service Worker — lightweight app-shell PWA
// Strategy:
//   install  → precache app shell (/, /offline.html, static fonts/css)
//   activate → claim clients immediately, prune old caches
//   fetch    → static assets: cache-first | navigations: network-first w/ offline fallback | API/auth: network-only

const SHELL_CACHE = 'snrpmo-shell-v1';
const STATIC_CACHE = 'snrpmo-static-v1';

const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/icon-192.svg',
  '/icon-512.svg',
];

// ── Install: precache the app shell ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: claim all clients, delete stale caches ─────────────────────────
self.addEventListener('activate', (event) => {
  const CURRENT = new Set([SHELL_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !CURRENT.has(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET, cross-origin, and auth/API requests — let them pass through.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // 2. Next.js static assets (_next/static) → cache-first (immutable hashed filenames).
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // 3. Navigation requests → network-first, fall back to /offline.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() =>
          caches.match('/offline.html').then((r) => r || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // 4. Other same-origin GETs (images, fonts from /public) → cache-first.
  event.respondWith(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        });
      })
    )
  );
});
