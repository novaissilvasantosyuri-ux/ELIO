import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { forwardSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/messages/[id]/forward { conversation_id } — encaminha (marca a cópia). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`msg:${ctx.user.id}`, envLimit("RATE_MESSAGE_PER_MIN", 60)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Mensagem inválida.", 400);
  let conversation_id: string;
  try {
    conversation_id = forwardSchema.parse(await req.json()).conversation_id;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("forward_message", { p_msg: id, p_conv: conversation_id });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data as { id: string });
}
