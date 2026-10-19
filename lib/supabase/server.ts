import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para Server Components / Route Handlers / Proxy.
 * Recebe o "pote de cookies" de quem chama (cada ambiente entrega de um jeito).
 */
export function supabaseServer(cookieStore: {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: Array<{ name: string; value: string; options?: object }>) => void;
}): SupabaseClient {
  const methods: CookieMethodsServer = {
    getAll: () => cookieStore.getAll(),
    setAll: (cookies) => cookieStore.setAll(cookies),
  };
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    { cookies: methods },
  );
}

/**
 * Cliente administrativo (service_role). SÓ no servidor, SÓ em rotas validadas.
 * Pula o RLS — cada uso precisa de checagem manual de permissão.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado no servidor.");
  return createClient(url, key, { auth: { persistSession: false } });
}
