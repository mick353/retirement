const CACHE_PREFIX = "robinson-retirement-pages-";
const CACHE = `${CACHE_PREFIX}v36`;
const SCOPE = new URL(self.registration.scope);
const scopedUrl = (path = "") => new URL(path, SCOPE).toString();
const REPORT_PAGES = ["deep-model", "atlas", "atlas-prototype", "model-reference"];
const APP_SHELL = [
  ...REPORT_PAGES.map(page => scopedUrl(`${page}.html?v=36`)),
  scopedUrl("atlas.css?v=28"), scopedUrl("atlas.js?v=28"), scopedUrl("atlas-entry.js?v=28"),
  scopedUrl("retirement-engine.js?v=5"), scopedUrl("model-reference.txt?v=36"),
  scopedUrl("vendor/chart.umd.js"), scopedUrl("manifest.webmanifest"), scopedUrl("favicon.svg"),
];

function launchAssets(html) {
  const addresses = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)];
  return [...new Set(addresses.map(match => new URL(match[1], SCOPE))
    .filter(url => url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname) && /\.(?:js|css)$/.test(url.pathname))
    .map(url => url.href))];
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const home = await fetch(scopedUrl(), { cache: "reload" });
      if (!home.ok) throw new Error("Retirement launch page unavailable");
      const assets = launchAssets(await home.clone().text());
      await cache.addAll([...new Set([...APP_SHELL, ...assets])].map(url => new Request(url, { cache: "reload" })));
      await cache.put(scopedUrl(), home);
      await self.skipWaiting();
    } catch (error) {
      // Keep the currently installed version if its replacement cannot open offline.
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname) || url.pathname.includes("/api/")) return;
  const network = fetch(request);
  event.waitUntil(network.then((response) => {
    if (!response.ok) return;
    const copy = response.clone();
    return caches.open(CACHE).then((cache) => cache.put(request, copy));
  }).catch(() => undefined));
  event.respondWith(network.catch(async () => {
    const cache = await caches.open(CACHE);
    let cached = await cache.match(request, { ignoreSearch: true });
    if (request.mode === "navigate") {
      // Sites uses extensionless report URLs while Pages serves the .html filenames.
      const page = url.pathname.slice(SCOPE.pathname.length);
      if (!cached && REPORT_PAGES.includes(page)) {
        cached = await cache.match(scopedUrl(`${page}.html`), { ignoreSearch: true });
      }
      cached ??= await cache.match(scopedUrl());
      // A navigation uses manual redirects and cannot accept a cached followed response.
      if (cached?.redirected) {
        const headers = new Headers(cached.headers);
        headers.delete("Content-Encoding");
        headers.delete("Content-Length");
        return new Response(cached.body, { status: cached.status, headers });
      }
    }
    return cached ?? Response.error();
  }));
});
