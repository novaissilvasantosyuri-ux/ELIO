import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, zodError } from "@/app/api/_helpers";
import { muteSchema, userIdSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";

/** POST /api/mutes { user_id, until } — silencia pessoa (1h/8h/1sem/sempre). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`mute:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: unknown;
  try {
    body = muteSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { user_id, until } = body as { user_id: string; until: string | null };
  if (user_id === ctx.user.id) return apiError("Você não pode fazer isso com você mesmo. 🙂", 400);
  const { error } = await ctx.sb
    .from("mutes")
    .upsert({ user_id: ctx.user.id, muted_user_id: user_id, until }, { onConflict: "user_id,muted_user_id" });
  if (error) return apiError("Não foi possível silenciar. Tente de novo.", 500);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/mutes { user_id } — reativa o som. */
export async function DELETE(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  let body: unknown;
  try {
    body = userIdSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { user_id } = body as { user_id: string };
  const { error } = await ctx.sb.from("mutes").delete().eq("user_id", ctx.user.id).eq("muted_user_id", user_id);
  if (error) return apiError("Não foi possível reativar. Tente de novo.", 500);
  return NextResponse.json({ ok: true });
}
