import { NextResponse, type NextRequest } from "next/server";
import { authed, apiError } from "@/app/api/_helpers";
import { normalizeUsername, validateUsername } from "@/lib/utils";
import { clientIp, envLimit, rateLimit } from "@/lib/security";

/** GET /api/username/check?u=xxx → { available, reason? } (validação em tempo real). */
export async function GET(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`username:${clientIp(req)}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const u = normalizeUsername(req.nextUrl.searchParams.get("u") ?? "");
  const invalid = validateUsername(u);
  if (invalid) return NextResponse.json({ available: false, reason: invalid });

  const { data, error } = await ctx.sb.from("profiles").select("id").eq("username", u).maybeSingle();
  if (error) return apiError("Algo não saiu como esperado. Tente de novo.", 500);
  // quantas trocas restam (3 a cada 30 dias)
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count } = await ctx.sb
    .from("username_changes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .gt("changed_at", since);
  const left = Math.max(0, 3 - (count ?? 0));
  if (data && data.id === ctx.user.id) return NextResponse.json({ available: true, mine: true, left });
  if (data) return NextResponse.json({ available: false, reason: "Esse @usuário já está em uso.", left });
  return NextResponse.json({ available: true, left });
}
