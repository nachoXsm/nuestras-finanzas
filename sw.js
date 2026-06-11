const CACHE = 'nf-v81';
// Solo lo esencial en el precache. Si un archivo del precache falla (p. ej. durante
// un deploy en curso) NO debe romper toda la instalación del SW.
const PRECACHE = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
];
// Las placas premium se cachean on-demand desde el fetch handler.
// manifest.webmanifest is intentionally excluded from precache so Android
// always reads the latest version and never shows a "name changed" warning.
const NEVER_CACHE = ['/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla si CUALQUIER recurso falla; usamos add individual con catch
      // para que la instalación nunca quede bloqueada por un solo archivo.
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname !== self.location.hostname) return;

  // Always fetch manifest fresh from network — never serve from cache
  if (NEVER_CACHE.some(p => url.pathname === p)) {
    e.respondWith(fetch(e.request));
    return;
  }

  const isNavigation = e.request.mode === 'navigate';

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Solo cacheamos respuestas válidas (200). Un 404/redirección no se cachea.
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Sin red: para navegaciones servimos el index cacheado (SPA shell).
        // Para imágenes/otros recursos NO devolvemos index.html (rompería el <img>).
        if (isNavigation) return caches.match('/index.html');
        return Response.error();
      });
    })
  );
});
