import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { joinByInviteSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

/** POST /api/communities/join { code } — entra na comunidade pelo código de convite. */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`join:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let code: string;
  try {
    code = joinByInviteSchema.parse(await req.json()).code;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("join_community_by_invite", { p_code: code });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  const row = data as { id: string; joined: boolean };
  if (row.joined) await audit(ctx.user.id, "community_joined", { community_id: row.id });
  return NextResponse.json(row);
}
