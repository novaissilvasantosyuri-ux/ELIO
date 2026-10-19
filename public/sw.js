/* Elio service worker (Fase 4 + PWA): notificações push + instalabilidade. Sem cache offline em v1. */

// Passagem direta (não muda nada no tráfego; só satisfaz o critério "instalável" do Chrome).
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const options = {
    body: data.body || "Nova mensagem",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "elio-msg",
    renotify: true,
    data: { url: data.url || "/conversas" },
  };
  event.waitUntil(self.registration.showNotification(data.title || "Elio", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/conversas";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
