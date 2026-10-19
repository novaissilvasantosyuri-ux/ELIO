"use client";

/**
 * Push no navegador (Fase 4): registra o service worker, pede permissão
 * e assina/cancela no servidor. Tudo com fallback amigável.
 */

export type PushState = "unsupported" | "denied" | "subscribed" | "off" | "unconfigured";

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlToKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out as Uint8Array<ArrayBuffer>;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Estado atual (não pede nada ao usuário). */
export async function getPushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "subscribed" : "off";
  } catch {
    return "off";
  }
}

/** Liga: permissão + assinatura + salva no servidor. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const keyRes = await fetch("/api/push/vapid-key");
    const { key } = (await keyRes.json()) as { key?: string | null };
    if (!key) return "unconfigured";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await registration();
    if (!reg) return "off";
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlToKey(key),
    });
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      }),
    });
    if (!res.ok) {
      await sub.unsubscribe().catch(() => undefined);
      return res.status === 503 ? "unconfigured" : "off";
    }
    return "subscribed";
  } catch {
    return "off";
  }
}

/** Desliga: cancela no navegador e no servidor. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
    }
  } catch {
    /* desligar nunca falha na tela */
  }
}
