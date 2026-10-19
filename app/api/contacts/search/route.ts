import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { normalizeUsername } from "@/lib/utils";
import { envLimit, rateLimit } from "@/lib/security";
import type { FoundUser } from "@/lib/supabase/types";

/** GET /api/contacts/search?u=@ — busca exata respeitando bloqueio e privacidade. */
export async function GET(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const u = normalizeUsername(req.nextUrl.searchParams.get("u") ?? "");
  if (u.length < 3) return NextResponse.json({ user: null });
  const { data, error } = await ctx.sb.rpc("find_by_username", { p_username: u });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ user: (data ?? null) as FoundUser | null });
}
