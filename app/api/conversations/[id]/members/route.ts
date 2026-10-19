import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { memberActionSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";
import type { GroupInfo } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

function badId(id: string) {
  return !uuidSchema.safeParse(id).success;
}

/** GET /api/conversations/[id]/members — dados do grupo + membros (só membros). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (badId(id)) return apiError("Conversa inválida.", 400);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("get_group_members", { p_conv: id });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data as GroupInfo);
}

/**
 * POST /api/conversations/[id]/members — gestão do grupo.
 * { action: "add", member_ids } | { action: "remove"|"role", user_id, role? }
 * | { action: "leave" } | { action: "rotate_invite" }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (badId(id)) return apiError("Conversa inválida.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: unknown;
  try {
    body = memberActionSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const b = body as { action: string; member_ids?: string[]; user_id?: string; role?: string };

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await ctx.sb.rpc(fn, args);
    if (error) {
      const m = rpcErrorMessage(error);
      return { err: apiError(m.message, m.status) as NextResponse, data: null };
    }
    return { err: null, data };
  };

  if (b.action === "add") {
    const { err, data } = await call("add_group_members", { p_conv: id, p_member_ids: b.member_ids });
    if (err) return err;
    return NextResponse.json(data);
  }
  if (b.action === "remove") {
    const { err, data } = await call("remove_group_member", { p_conv: id, p_user: b.user_id });
    if (err) return err;
    await audit(ctx.user.id, "group_member_removed", { conversation_id: id });
    return NextResponse.json(data);
  }
  if (b.action === "role") {
    const { err, data } = await call("set_member_role", { p_conv: id, p_user: b.user_id, p_role: b.role });
    if (err) return err;
    await audit(ctx.user.id, "group_role_changed", { conversation_id: id });
    return NextResponse.json(data);
  }
  if (b.action === "leave") {
    const { err, data } = await call("leave_group", { p_conv: id });
    if (err) return err;
    return NextResponse.json(data);
  }
  // rotate_invite
  const { err, data } = await call("rotate_invite", { p_conv: id });
  if (err) return err;
  return NextResponse.json(data);
}
