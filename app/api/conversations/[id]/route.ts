import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { conversationPatchSchema, isStoragePath, uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/conversations/[id]
 * fixar, arquivar, silenciar, marcar não lida, limpar histórico, wallpaper da conversa.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`conv:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Conversa inválida.", 400);
  let body: unknown;
  try {
    body = conversationPatchSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const b = body as {
    pinned?: boolean; archived?: boolean; muted_until?: string | null;
    mark_unread?: boolean; clear?: boolean; wallpaper?: unknown;
    group_title?: string; group_description?: string;
  };

  // precisa ser membro (anti-IDOR)
  const { data: mem } = await ctx.sb
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!mem) return apiError("Você não tem permissão para isso.", 403);

  const patch: Record<string, unknown> = {};
  if (b.pinned !== undefined) patch.pinned_at = b.pinned ? new Date().toISOString() : null;
  if (b.archived !== undefined) patch.archived_at = b.archived ? new Date().toISOString() : null;
  if (b.muted_until !== undefined) patch.muted_until = b.muted_until;
  if (b.mark_unread) {
    patch.last_read_at = null;
    patch.last_read_message_id = null;
  }
  if (b.clear) {
    patch.cleared_at = new Date().toISOString();
    patch.last_read_at = new Date().toISOString();
  }
  if (b.wallpaper !== undefined) {
    const w = b.wallpaper as { value?: { kind?: string; url?: string } } | null;
    if (w?.value?.kind === "image") {
      const url = w.value.url ?? "";
      if (!isStoragePath(url)) {
        return apiError("Imagem inválida. Envie pelo app.", 400);
      }
    }
    patch.wallpaper = b.wallpaper;
  }
  // nome/descrição do grupo (só admins; o RPC valida todo o resto)
  if (b.group_title !== undefined || b.group_description !== undefined) {
    const { error: gError } = await ctx.sb.rpc("update_group", {
      p_conv: id,
      p_title: b.group_title ?? null,
      p_description: b.group_description ?? null,
    });
    if (gError) {
      const m = rpcErrorMessage(gError);
      return apiError(m.message, m.status);
    }
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await ctx.sb
    .from("conversation_members")
    .update(patch)
    .eq("conversation_id", id)
    .eq("user_id", ctx.user.id);
  if (error) return apiError("Não foi possível salvar. Tente de novo.", 500);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/conversations/[id] — "apagar conversa" (só para mim: limpa o histórico). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Conversa inválida.", 400);
  const { data: mem } = await ctx.sb
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!mem) return apiError("Você não tem permissão para isso.", 403);
  const now = new Date().toISOString();
  const { error } = await ctx.sb
    .from("conversation_members")
    .update({ cleared_at: now, last_read_at: now, pinned_at: null })
    .eq("conversation_id", id)
    .eq("user_id", ctx.user.id);
  if (error) return apiError("Não foi possível apagar. Tente de novo.", 500);
  return NextResponse.json({ ok: true });
}
