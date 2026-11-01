/* ==========================================================================
   Service Worker — Grey Corner PWA
   Version: 1.0.0
   Cache Strategy:
   - Navigations: Network-First avec fallback Cache (index.html) pour mode hors-ligne
   - Actifs statiques locaux: Cache-First avec mise à jour en tâche de fond
   - CDNs (Polices, Tesseract): Stale-While-Revalidate
   - Requêtes Firebase/Firestore/Auth: Bypassed (gérées par le SDK Firebase)
   ========================================================================== */

const CACHE_NAME = 'grey-corner-cache-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './creance.html',
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

// Installation : mise en cache immédiate des fichiers du shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activation : suppression des anciens caches et prise de contrôle immédiate
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

// Écoute des requêtes réseau
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Ignorer les requêtes non-GET et les requêtes Firebase / Google API
  if (req.method !== 'GET') return;
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebaseinstallations') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // 2. Navigation HTML (pages) : Stratégie Network-First avec fallback hors-ligne
  if (req.mode === 'navigate') {
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
          // Si le réseau est indisponible, retourner le fichier en cache
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html');
        })
    );
    return;
  }

  // 3. Polices Google & CDNs statiques : Stale-While-Revalidate
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
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

  // 4. Actifs statiques locaux (icônes, manifest, etc.) : Cache-First
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return networkResponse;
      });
    })
  );
});
