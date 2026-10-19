import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Rotas que exigem login. */
const PROTECTED = ["/conversas", "/comunidades", "/contatos", "/explorar", "/perfil", "/config", "/onboarding"];
/** Rotas só para quem está deslogado. */
const GUEST_ONLY = ["/login", "/register"];

function isPath(pathname: string, list: string[]): boolean {
  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Atualiza a sessão (refresh) e aplica os guardas de rota.
 * Em /api não redireciona: as rotas devolvem 401 e o cliente trata.
 */
export async function updateSessionAndGuard(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabase = supabaseServer({
    getAll: () => request.cookies.getAll(),
    setAll: (all) => {
      all.forEach((c) => {
        request.cookies.set(c.name, c.value);
        response.cookies.set(c.name, c.value, c.options);
      });
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/api/")) return response;

  if (!user && isPath(pathname, PROTECTED)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (user && isPath(pathname, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = "/conversas";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
