import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { createChannelSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

/** POST /api/communities/[id]/channels { title, is_announcement? } — criar canal (admin+). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Comunidade inválida.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let parsed: { title: string; is_announcement: boolean };
  try {
    parsed = createChannelSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("create_channel", {
    p_comm: id,
    p_title: parsed.title,
    p_announcement: parsed.is_announcement,
  });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  const row = data as { id: string };
  await audit(ctx.user.id, "channel_created", { community_id: id, conversation_id: row.id });
  return NextResponse.json({ id: row.id, created: true });
}
