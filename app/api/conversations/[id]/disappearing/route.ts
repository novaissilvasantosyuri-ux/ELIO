import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { disappearingSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/conversations/[id]/disappearing { seconds: 0|86400|604800 } — timer de sumiço. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Conversa inválida.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let seconds: number;
  try {
    seconds = disappearingSchema.parse(await req.json()).seconds;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("set_disappearing", { p_conv: id, p_seconds: seconds });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  await audit(ctx.user.id, "disappearing_set", { conversation_id: id, seconds });
  return NextResponse.json(data as { disappear_after: number });
}
