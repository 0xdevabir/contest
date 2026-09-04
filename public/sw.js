// Phase 14 — PWA offline story (D4). Hand-rolled rather than a generated
// precache manifest (workbox/next-pwa need a build-time integration this
// repo doesn't otherwise have): every strategy below populates its cache at
// runtime instead of on install, which still gets a returning student a
// fully offline app shell + their recently-viewed problems after one visit.
//
// Bump this on every deploy that changes caching behaviour — the "update
// available" prompt (src/components/ServiceWorkerRegister.tsx) is driven by
// a *new* service-worker file being detected, not by this string, but a
// stale CACHE_VERSION left behind after a bad deploy is the standard way an
// old SW keeps serving old code (see the phase doc's risk table) — an
// explicit unregister path exists for that: unregisterServiceWorker() in
// ServiceWorkerRegister.tsx.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `diu-shell-${CACHE_VERSION}`;
const MONACO_CACHE = `diu-monaco-${CACHE_VERSION}`;
const STATEMENT_CACHE = `diu-statements-${CACHE_VERSION}`;
const API_CACHE = `diu-api-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, MONACO_CACHE, STATEMENT_CACHE, API_CACHE];

// Never cached — stale standings are worse than none (D4's explicit table).
const NETWORK_ONLY_PATTERNS = [/\/standings(\/|$)/, /\/api\/.*\/standings/, /\/api\/leaderboard/];

const OFFLINE_FALLBACK_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title>
<style>body{font:15px system-ui,sans-serif;background:#080b10;color:#e8eef6;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}
div{max-width:22rem}</style></head>
<body><div><h1 style="font-size:1.1rem">You're offline</h1>
<p>This page hasn't been cached yet. Reconnect and try again — anything you've
already opened (problems, the editor) still works offline.</p></div></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !ALL_CACHES.includes(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isNetworkOnly(url) {
  return NETWORK_ONLY_PATTERNS.some((re) => re.test(url.pathname));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline, no cache");
  }
}

async function navigationHandler(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNetworkOnly(url)) return;

  // App shell / client navigations — network-first so a deploy is visible
  // immediately, cached fallback for the offline case.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Monaco: the largest single asset and the one whose absence blocks work
  // entirely — precached (at runtime, on first load) and served cache-first.
  if (url.pathname.startsWith("/monaco/")) {
    event.respondWith(cacheFirst(request, MONACO_CACHE));
    return;
  }

  // Next's content-hashed build output — safe to cache-first forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Problem statements: explicitly pre-cacheable for an active contest via
  // `cacheStatement()` below, stale-while-revalidate otherwise.
  if (/^\/problems\/[^/]+$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATEMENT_CACHE));
    return;
  }

  // Other API reads: network-first with a cache fallback, matching the
  // "showing cached data" contract — the client shows OfflineIndicator
  // whenever `navigator.onLine` is false, regardless of which fetch served it.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
});

// Lets a student (or a contest/assignment view) explicitly warm the cache
// for an upcoming offline session — "explicitly pre-cached for an active
// contest or assignment" per D4's statement-caching row.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "CACHE_URLS" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches
        .open(STATEMENT_CACHE)
        .then((cache) => cache.addAll(event.data.urls))
        .catch(() => {})
    );
  }
});

// Phase 11 — minimal web push receiver. Registered on demand from
// src/components/profile/NotificationPreferencesForm.tsx when a student
// opts into browser push notifications.
self.addEventListener("push", (event) => {
  let data = { title: "Notification", body: "", href: "/" };
  try {
    data = event.data ? event.data.json() : data;
  } catch {
    /* non-JSON payload — use the defaults above */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Notification", {
      body: data.body || "",
      data: { href: data.href || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(clients.openWindow(href));
});
