import { type NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { envLimit, rateLimit } from "@/lib/security";

/** POST /api/presence/peers { ids } — presença filtrada pela privacidade de cada um. */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let ids: string[];
  try {
    ids = z.object({ ids: z.array(z.string().uuid()).max(50) }).parse(await req.json()).ids;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("get_presence", { p_ids: ids });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ presence: data ?? [] });
}
