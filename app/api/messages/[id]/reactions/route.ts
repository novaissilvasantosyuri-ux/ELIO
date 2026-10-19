import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { reactionSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";
import type { ReactionCount } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/messages/[id]/reactions { emoji } — reagir ou tirar a reação.
 * Devolve { reacted, counts } para atualizar na hora.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`msg:${ctx.user.id}`, envLimit("RATE_MESSAGE_PER_MIN", 60)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Mensagem inválida.", 400);
  let emoji: string;
  try {
    emoji = reactionSchema.parse(await req.json()).emoji;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("toggle_reaction", { p_msg: id, p_emoji: emoji });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data as { reacted: boolean; counts: ReactionCount[] });
}
