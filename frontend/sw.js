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
  '/',
  '/index.html',
  '/security.html',
  '/learn.html',
  '/guides.html',
  '/governance.html',
  '/css/style.css',
  '/script/script.js',
  '/logo.png',
  '/favicon.png',
  '/manifest.json',
  '/sw.js',

  // dApp Pages
  '/app/index.html',
  '/app/analytics.html',
  '/app/liquidations.html',
  '/app/Transaction.html',
  '/app/auth.html',
  '/app/admin.html',

  // dApp CSS
  '/app/css/index-styles.css',
  '/app/css/analytics-styles.css',
  '/app/css/liquidations-styles.css',
  '/app/css/transaction-styles.css',
  '/app/css/auth-styles.css',
  '/app/css/admin-styles.css',

  // dApp Scripts
  '/app/script/shared-wallet.js',
  '/app/script/index.js',
  '/app/script/analytics.js',
  '/app/script/liquidations.js',
  '/app/script/transactions.js',
  '/app/script/auth.js',
  '/app/script/admin.js',

  // PWA Icons
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png'
];



self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event: serves cached content when available for faster loading.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request);
      })
  );
});

// Activate event: removes old caches to keep the app updated.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
