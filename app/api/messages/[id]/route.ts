import { type NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { editMessageSchema, uuidSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/messages/[id] { body } — edita texto próprio (até 30 min).
 * O RPC valida autoria, tipo e janela de tempo.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`msg:${ctx.user.id}`, envLimit("RATE_MESSAGE_PER_MIN", 60)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Mensagem inválida.", 400);
  let body: string;
  try {
    body = editMessageSchema.parse(await req.json()).body;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("edit_message", { p_msg: id, p_body: body });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data);
}

/**
 * DELETE /api/messages/[id]?scope=me|all
 * - me: apaga só para mim. - all: só o autor, apaga para todos (sem volta).
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`msg:${ctx.user.id}`, envLimit("RATE_MESSAGE_PER_MIN", 60)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Mensagem inválida.", 400);
  let scope: "me" | "all";
  try {
    scope = z.object({ scope: z.enum(["me", "all"]) }).parse({
      scope: req.nextUrl.searchParams.get("scope") ?? "me",
    }).scope;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }

  // busca a mensagem (o RLS garante: só membro da conversa vê)
  const { data: msg } = await ctx.sb
    .from("messages")
    .select("id, conversation_id, sender_id")
    .eq("id", id)
    .maybeSingle();
  if (!msg) return apiError("Não encontramos isso. Pode ter sido apagado.", 404);

  if (scope === "me") {
    const { error } = await ctx.sb
      .from("message_deletes")
      .upsert({ message_id: id, user_id: ctx.user.id }, { onConflict: "message_id,user_id" });
    if (error) return apiError("Não foi possível apagar. Tente de novo.", 500);
    return NextResponse.json({ ok: true });
  }

  // para todos: só o autor (checagem manual, pois usa o cliente admin p/ apagar em cascata)
  if (msg.sender_id !== ctx.user.id) {
    return apiError("Só quem enviou pode apagar para todos.", 403);
  }
  const admin = supabaseAdmin();
  const { data: atts } = await admin.from("attachments").select("storage_path").eq("message_id", id);
  const { error } = await admin.from("messages").delete().eq("id", id);
  if (error) return apiError("Não foi possível apagar. Tente de novo.", 500);
  const paths = ((atts ?? []) as Array<{ storage_path: string }>).map((a) => a.storage_path);
  if (paths.length > 0) {
    await admin.storage.from("chat-media").remove(paths).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
