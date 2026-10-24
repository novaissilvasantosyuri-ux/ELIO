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
  // chamada com o app aberto: a tela de Atender/Recusar já aparece; sem duplicar
  if (data.type === "call") {
    const callOptions = {
      ...options,
      data: { url: data.url || "/conversas", callId: data.call_id || null },
      vibrate: [400, 200, 400, 200, 800],
      requireInteraction: true,
      actions: [
        { action: "answer", title: "Atender" },
        { action: "decline", title: "Recusar" },
      ],
    };
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => {
          const visible = list.some((c) => c.visibilityState === "visible");
          if (!visible) return self.registration.showNotification(data.title || "Elio", callOptions);
          return undefined;
        }),
    );
    return;
  }
  event.waitUntil(self.registration.showNotification(data.title || "Elio", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  // "Recusar" direto na notificação: avisa o servidor (quem ligou descobre pelo radar)
  if (event.action === "decline" && data.callId) {
    event.waitUntil(
      fetch(`/api/calls/${data.callId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      }).catch(() => undefined),
    );
    return;
  }
  const url = data.url || "/conversas";
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
