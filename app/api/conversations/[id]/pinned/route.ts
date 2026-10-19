import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";
import type { PinnedMessage } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/conversations/[id]/pinned — mensagens fixadas (só membros). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Conversa inválida.", 400);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("get_pinned", { p_conv: id });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ pinned: (data ?? []) as PinnedMessage[] });
}
