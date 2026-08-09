const CACHE_NAME = "dimpro-dev-shell-v2";
const SHELL_URLS = ["/pwa/dimpro-dev-192.png", "/pwa/dimpro-dev-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    ]),
  );
});

// A service worker nem avatkozik be a lapok, CSS- vagy JavaScript-fájlok betöltésébe.
// Feladata kizárólag a push értesítések kezelése.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "Új DIMPRO fejlesztési értesítés érkezett." };
  }

  const title = payload.title || "DIMPRO fejlesztési értesítés";
  const options = {
    body: payload.body || "A fejlesztési állapot megváltozott.",
    icon: payload.icon || "/pwa/dimpro-dev-192.png",
    badge: payload.badge || "/pwa/dimpro-dev-192.png",
    tag: payload.tag || "dimpro-dev-update",
    data: { url: payload.url || "/admin/dev#ertesitesek", payload },
    vibrate: payload.priority === "high" ? [250, 100, 250, 100, 450] : [180, 80, 180],
    requireInteraction: payload.priority === "high",
    renotify: true,
    actions: [{ action: "open", title: "Megnyitás" }],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "DIMPRO_DEV_PUSH", payload }));
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/admin/dev#ertesitesek", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    }),
  );
});
