import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Troca o ?code do e-mail (confirmar conta / recuperar senha) por sessão. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/conversas";

  if (!code) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL(next, req.url));
  const sb = supabaseServer({
    getAll: () => req.cookies.getAll(),
    setAll: (all) => {
      all.forEach((c) => response.cookies.set(c.name, c.value, c.options));
    },
  });
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    const login = new URL("/login", req.url);
    login.searchParams.set("error", "link");
    return NextResponse.redirect(login);
  }
  return response;
}
