import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/communities/[id]/join — entrar (comunidades abertas; entra em todos os canais). */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Comunidade inválida.", 400);
  if (!(await rateLimit(`join:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("join_community", { p_comm: id });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  const row = data as { id: string; joined: boolean };
  if (row.joined) await audit(ctx.user.id, "community_joined", { community_id: row.id });
  return NextResponse.json(row);
}
