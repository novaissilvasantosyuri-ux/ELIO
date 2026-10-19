import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { endCallSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/calls/[id]/end { action } — cancel/reject/timeout/hangup. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Chamada inválida.", 400);
  if (!(await rateLimit(`call:${ctx.user.id}`, envLimit("RATE_CALL_PER_MIN", 10)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let action: "cancel" | "reject" | "timeout" | "hangup";
  try {
    action = endCallSchema.parse(await req.json()).action;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("end_call", { p_call: id, p_action: action });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data as { status: string });
}
