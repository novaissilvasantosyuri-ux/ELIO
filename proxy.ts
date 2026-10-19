import { type NextRequest } from "next/server";
import { updateSessionAndGuard } from "./lib/supabase/proxy-session";

/**
 * Proxy do Next 16 (substitui o antigo middleware): roda antes de cada rota.
 * - Atualiza a sessão do Supabase (refresh de tokens).
 * - Protege rotas: área logada exige login; login/cadastro redirecionam quem já entrou.
 */
export async function proxy(request: NextRequest) {
  return updateSessionAndGuard(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|webmanifest|txt)).*)"],
};
