import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, zodError } from "@/app/api/_helpers";
import { userIdSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { envLimit, rateLimit, audit } from "@/lib/security";

/** Acha a DM entre eu e o alvo (para registrar a mensagem de sistema). */
async function findDm(me: string, other: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("conversation_members")
    .select("conversation_id, conversations!inner(type)")
    .eq("user_id", me);
  const rows = (data ?? []) as unknown as Array<{ conversation_id: string; conversations: { type: string } }>;
  for (const r of rows) {
    if (r.conversations.type !== "direct") continue;
    const { data: peer } = await admin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", r.conversation_id)
      .eq("user_id", other)
      .maybeSingle();
    if (peer) return r.conversation_id;
  }
  return null;
}

/** POST /api/blocks { user_id } — bloqueia (vale no servidor; sem avisar a pessoa). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`block:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: unknown;
  try {
    body = userIdSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { user_id } = body as { user_id: string };
  if (user_id === ctx.user.id) return apiError("Você não pode fazer isso com você mesmo. 🙂", 400);

  const { data: target } = await ctx.sb.from("profiles").select("username").eq("id", user_id).maybeSingle();
  const { error } = await ctx.sb
    .from("blocks")
    .upsert({ blocker_id: ctx.user.id, blocked_id: user_id }, { onConflict: "blocker_id,blocked_id" });
  if (error) return apiError("Não foi possível bloquear. Tente de novo.", 500);

  // mensagem de sistema na DM (só eu vejo, pois a DM some da lista dela... na verdade some da MINHA lista;
  // a mensagem fica registrada para contexto)
  try {
    const dm = await findDm(ctx.user.id, user_id);
    if (dm) {
      const admin = supabaseAdmin();
      await admin.from("messages").insert({
        conversation_id: dm,
        sender_id: null,
        type: "system",
        body: `Você bloqueou @${target?.username ?? "esta pessoa"}.`,
      });
    }
  } catch {
    /* bloqueio vale mesmo sem a mensagem */
  }
  await audit(ctx.user.id, "blocked", {});
  return NextResponse.json({ ok: true });
}

/** DELETE /api/blocks { user_id } — desbloqueia. */
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
  const { error } = await ctx.sb.from("blocks").delete().eq("blocker_id", ctx.user.id).eq("blocked_id", user_id);
  if (error) return apiError("Não foi possível desbloquear. Tente de novo.", 500);
  try {
    const dm = await findDm(ctx.user.id, user_id);
    if (dm) {
      const admin = supabaseAdmin();
      const { data: target } = await admin.from("profiles").select("username").eq("id", user_id).maybeSingle();
      await admin.from("messages").insert({
        conversation_id: dm,
        sender_id: null,
        type: "system",
        body: `Você desbloqueou @${target?.username ?? "esta pessoa"}.`,
      });
    }
  } catch {
    /* ok */
  }
  await audit(ctx.user.id, "unblocked", {});
  return NextResponse.json({ ok: true });
}
