import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { communityMemberActionSchema, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/communities/[id]/members — gestão da comunidade.
 * { action: "role", user_id, role } (só dono)
 * | { action: "remove", user_id } (admin+) | { action: "leave" }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Comunidade inválida.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: { action: string; user_id?: string; role?: string };
  try {
    body = communityMemberActionSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await ctx.sb.rpc(fn, args);
    if (error) {
      const m = rpcErrorMessage(error, "community");
      return { err: apiError(m.message, m.status) as NextResponse, data: null };
    }
    return { err: null, data };
  };

  if (body.action === "role") {
    const { err, data } = await call("set_community_role", {
      p_comm: id,
      p_user: body.user_id,
      p_role: body.role,
    });
    if (err) return err;
    await audit(ctx.user.id, "community_role_set", { community_id: id });
    return NextResponse.json(data);
  }
  if (body.action === "remove") {
    const { err, data } = await call("remove_community_member", { p_comm: id, p_user: body.user_id });
    if (err) return err;
    await audit(ctx.user.id, "community_member_removed", { community_id: id });
    return NextResponse.json(data);
  }
  // leave
  const { err, data } = await call("leave_community", { p_comm: id });
  if (err) return err;
  await audit(ctx.user.id, "community_left", { community_id: id });
  return NextResponse.json(data);
}
