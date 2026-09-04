const CACHE = "robinson-retirement-pages-v24";
const scopedUrl = (path = "") => new URL(path, self.registration.scope).toString();
const APP_SHELL = [scopedUrl(), scopedUrl("deep-model.html?v=24"), scopedUrl("atlas.html?v=24"), scopedUrl("atlas-prototype.html?v=24"), scopedUrl("atlas.css?v=24"), scopedUrl("atlas.js?v=24"), scopedUrl("model-reference.html?v=24"), scopedUrl("model-reference.txt?v=24"), scopedUrl("vendor/chart.umd.js"), scopedUrl("manifest.webmanifest"), scopedUrl("favicon.svg")];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match(scopedUrl()))));
});
