// Cache version is auto-generated during build to ensure fresh updates
const CACHE_VERSION = "__CACHE_VERSION__"; // Replaced during build
const CACHE_NAME = `homelab-v${CACHE_VERSION}`;
const urlsToCache = [
    "/",
    "/index.html",
    "/manifest.json",
    "/assets/icon-192.png",
    "/assets/icon-512.png",
];

self.addEventListener("install", function (event) {
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                console.log("Opened cache");
                return cache.addAll(urlsToCache);
            }),
    );
});

self.addEventListener("fetch", function (event) {
    event.respondWith(
        caches.match(event.request)
            .then(function (response) {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            }),
    );
});

self.addEventListener("activate", function (event) {
    // Take control of all clients immediately
    event.waitUntil(
        clients.claim().then(() => {
            return caches.keys().then(function (cacheNames) {
                return Promise.all(
                    cacheNames.map(function (cacheName) {
                        if (cacheName !== CACHE_NAME) {
                            console.log("Deleting old cache:", cacheName);
                            return caches.delete(cacheName);
                        }
                    }),
                );
            });
        }),
    );
});
