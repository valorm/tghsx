/**
 * ==================================================================================
 * Service Worker (sw.js) - v2
 *
 * This service worker handles caching for the entire frontend, including both
 * the marketing pages and the dApp, for a complete offline-first experience.
 * ==================================================================================
 */

const CACHE_NAME = 'tghsx-cache-v2';
const urlsToCache = [
  '/frontend/',
  '/frontend/index.html',
  '/frontend/security.html',
  '/frontend/learn.html',
  '/frontend/guides.html',
  '/frontend/governance.html',
  '/frontend/css/style.css',
  '/frontend/script/script.js',
  '/frontend/logo.png',
  '/frontend/favicon.png',
  '/frontend/manifest.json',
  '/frontend/sw.js',

  '/frontend/app/index.html',
  '/frontend/app/analytics.html',
  '/frontend/app/liquidations.html',
  '/frontend/app/transaction.html',
  '/frontend/app/auth.html',
  '/frontend/app/admin.html',

  '/frontend/css/index-styles.css',
  '/frontend/css/analytics-styles.css',
  '/frontend/css/liquidations-styles.css',
  '/frontend/css/transaction-styles.css',
  '/frontend/css/auth-styles.css',
  '/frontend/css/admin-styles.css',

  '/frontend/script/shared-wallet.js',
  '/frontend/script/index.js',
  '/frontend/script/analytics.js',
  '/frontend/script/liquidations.js',
  '/frontend/script/transactions.js',
  '/frontend/script/auth.js',
  '/frontend/script/admin.js',

  '/frontend/images/icons/icon-192x192.png',
  '/frontend/images/icons/icon-512x512.png'
];



// ✅ Updated INSTALL handler with error logging
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('Installing... Opening cache');
      try {
        await cache.addAll(urlsToCache);
        console.log('All files cached successfully!');
      } catch (err) {
        console.error('⚠️ cache.addAll failed:', err);
        const results = await Promise.allSettled(
          urlsToCache.map(url => cache.add(url))
        );
        results.forEach((res, i) => {
          if (res.status === 'rejected') {
            console.warn(`❌ Failed to cache: ${urlsToCache[i]}`);
          }
        });
      }
    })
  );
});

// Unchanged FETCH
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Unchanged ACTIVATE
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
