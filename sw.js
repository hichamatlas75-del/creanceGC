/* ==========================================================================
   Service Worker — Grey Corner PWA
   Version: 1.0.1 (Fix auth & Firebase Hosting bypass)
   ========================================================================== */

const CACHE_NAME = 'grey-corner-cache-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './creance.html',
  './caisse.html',
  './manifest.webmanifest',
  './manifest.json',
  './favicon.ico',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon-32.png',
  './icons/icon-16.png'
];

// Installation : mise en cache du shell de l'application
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activation : suppression immédiate des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Interception des requêtes réseau
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Ignorer les requêtes non-GET
  if (req.method !== 'GET') return;

  // 2. CRUCIAL : Ignorer TOUS les chemins internes Firebase Hosting et Auth (/__/auth/iframe, etc.)
  if (url.pathname.startsWith('/__/')) {
    return;
  }

  // 3. Ignorer TOUS les domaines Google, Firebase et extensions de navigateur
  if (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('google.com') ||
    url.hostname.endsWith('gstatic.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // 4. Navigation HTML (pages locales) : Stratégie Network-First avec fallback hors-ligne
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html');
        })
    );
    return;
  }

  // 5. Polices Google & CDNs statiques : Stale-While-Revalidate
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 6. Actifs statiques locaux (icônes, images) : Cache-First sécurisé (pas d'unhandled rejection)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response('', { status: 408, statusText: 'Offline Asset Unavailable' });
          });
      })
    );
  }
});
