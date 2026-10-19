import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { communityPatchSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";
import type { CommunityDetail } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

function badId(id: string) {
  return !uuidSchema.safeParse(id).success;
}

/** GET /api/communities/[id] — detalhe: canais + membros + meu papel (só membros). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (badId(id)) return apiError("Comunidade inválida.", 400);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("get_community", { p_comm: id });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data as CommunityDetail);
}

/**
 * PATCH /api/communities/[id] — editar nome/descrição ou girar convite (admin+).
 * { name?, description? } | { rotate_invite: true }
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (badId(id)) return apiError("Comunidade inválida.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: { name?: string; description?: string; rotate_invite?: boolean };
  try {
    body = communityPatchSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  if (body.rotate_invite) {
    const { data, error } = await ctx.sb.rpc("rotate_community_invite", { p_comm: id });
    if (error) {
      const m = rpcErrorMessage(error, "community");
      return apiError(m.message, m.status);
    }
    await audit(ctx.user.id, "community_invite_rotated", { community_id: id });
    return NextResponse.json(data as { code: string });
  }
  const { data, error } = await ctx.sb.rpc("update_community", {
    p_comm: id,
    p_name: body.name ?? null,
    p_description: body.description ?? null,
  });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  await audit(ctx.user.id, "community_updated", { community_id: id });
  return NextResponse.json(data as { updated: boolean });
}
