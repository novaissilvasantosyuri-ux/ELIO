"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** true/false conforme a conexão (online/offline). */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Relógio que atualiza a cada `ms` (para "há 5 min" etc.). */
export function useNow(ms = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Mostra (N) no título da aba quando há não lidas. */
export function useTitleBadge(count: number): void {
  useEffect(() => {
    const base = "Elio — Perto de quem importa";
    document.title = count > 0 ? `(${count}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [count]);
}

/**
 * No celular, o teclado muda a altura visível: espelha o visualViewport
 * numa variável CSS para o chat nunca ficar escondido.
 */
export function useVisualViewportVar(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    return () => vv.removeEventListener("resize", apply);
  }, []);
}

/** Callback com debounce (buscas). */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...a: Args) => void,
  ms: number,
): (...a: Args) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback(
    (...a: Args) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(...a), ms);
    },
    [ms],
  );
}
