import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { channelPatchSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";
import type { ChannelInfo } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

function badId(id: string) {
  return !uuidSchema.safeParse(id).success;
}

/** GET /api/channels/[id] — info do canal: comunidade, meu papel, posso postar? (só membros). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (badId(id)) return apiError("Canal inválido.", 400);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("get_channel_info", { p_ch: id });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data as ChannelInfo);
}

/** PATCH /api/channels/[id] { title?, is_announcement? } — editar canal (admin+). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (badId(id)) return apiError("Canal inválido.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: { title?: string; is_announcement?: boolean };
  try {
    body = channelPatchSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("update_channel", {
    p_ch: id,
    p_title: body.title ?? null,
    p_announcement: body.is_announcement ?? null,
  });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  await audit(ctx.user.id, "channel_updated", { conversation_id: id });
  return NextResponse.json(data as { updated: boolean });
}

/** DELETE /api/channels/[id] — apagar canal (admin+; nunca o último). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (badId(id)) return apiError("Canal inválido.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("delete_channel", { p_ch: id });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  await audit(ctx.user.id, "channel_deleted", { conversation_id: id });
  return NextResponse.json(data as { deleted: boolean });
}
