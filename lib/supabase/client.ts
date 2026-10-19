"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** O app abre mesmo sem env (mostra aviso de configuração em vez de tela branca). */
export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON && !URL.includes("xyzcompany"));
}

let singleton: SupabaseClient | null = null;

/** Cliente do navegador (singleton). Usa valores reserva para não quebrar o build sem env. */
export function supabaseBrowser(): SupabaseClient {
  if (singleton) return singleton;
  singleton = createBrowserClient(
    URL && URL.length > 0 ? URL : "https://placeholder.supabase.co",
    ANON && ANON.length > 0 ? ANON : "placeholder-anon-key",
  );
  return singleton;
}
