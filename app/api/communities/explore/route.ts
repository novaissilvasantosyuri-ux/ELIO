import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { envLimit, rateLimit } from "@/lib/security";
import type { ExploreItem } from "@/lib/supabase/types";

/** GET /api/communities/explore?q= — buscar comunidades para entrar (sem vazar convite). */
export async function GET(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  const { data, error } = await ctx.sb.rpc("explore_communities", { p_search: q });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ communities: (data ?? []) as ExploreItem[] });
}
