import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/calls/[id]/accept — atende a chamada (só quem recebe). */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Chamada inválida.", 400);
  if (!(await rateLimit(`call:${ctx.user.id}`, envLimit("RATE_CALL_PER_MIN", 10)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("accept_call", { p_call: id });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  await audit(ctx.user.id, "call_accepted", { call_id: id });
  return NextResponse.json(data as { accepted: boolean });
}
