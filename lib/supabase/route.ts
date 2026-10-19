import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/** Abre o cliente Supabase dentro de uma rota /api (com cookies da requisição). */
export async function supabaseRoute(): Promise<SupabaseClient> {
  const store = await cookies();
  return supabaseServer({
    getAll: () => store.getAll(),
    setAll: (all) => {
      all.forEach((c) => {
        try {
          store.set(c.name, c.value, c.options);
        } catch {
          /* rota somente-leitura de cookies: ok ignorar */
        }
      });
    },
  });
}

/** Retorna o usuário logado ou null (nunca confia em ID vindo do cliente). */
export async function currentUser(sb: SupabaseClient): Promise<User | null> {
  const { data } = await sb.auth.getUser();
  return data.user;
}
