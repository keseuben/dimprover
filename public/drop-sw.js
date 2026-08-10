const DROP_SW_VERSION = "DROP 1.2.12";
const STATIC_CACHE = "dimpro-drop-static-v1212";
const STATIC_ASSETS = [
  "/drop.webmanifest",
  "/drop-favicon-v099-32.png",
  "/drop-favicon-v099.ico",
  "/drop-apple-touch-v099-180.png",
  "/drop-app-icon-v099-192.png",
  "/drop-app-icon-v099-512.png",
  "/drop-app-icon-maskable-v099-512.png",
  "/dimpro-icon.svg"
];
const RESUME_SYNC_TAG = "dimpro-drop-upload-resume-v098";

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("dimpro-drop-") && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
    await broadcast({ type: "DROP_SW_READY", version: DROP_SW_VERSION });
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "REQUEST_UPLOAD_RESUME") {
    event.waitUntil(broadcast({ type: "DROP_UPLOAD_RESUME_REQUESTED", version: DROP_SW_VERSION }));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== RESUME_SYNC_TAG) return;
  event.waitUntil(broadcast({ type: "DROP_UPLOAD_RESUME_REQUESTED", version: DROP_SW_VERSION }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/send";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => "focus" in client);
    if (existing) {
      if ("navigate" in existing) await existing.navigate(targetUrl).catch(() => undefined);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/drop/d/")
    || url.pathname.startsWith("/drop/u/")
    || url.pathname.startsWith("/drop/p/")
    || url.pathname.startsWith("/drop/report/")
  ) return;
  const isStatic = url.pathname.startsWith("/_next/static/") || STATIC_ASSETS.includes(url.pathname);
  if (!isStatic) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
