"use client";

import { useEffect } from "react";

/**
 * Registra o service worker ao abrir o app (sem pedir nada ao usuário).
 * Necessário para o app ser "instalável" (PWA → APK) e para o push futuro.
 */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
