import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError } from "@/app/api/_helpers";
import { uuidSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/attachments/[id] — baixa um anexo.
 * Confere que sou membro (RLS) e redireciona para URL assinada de 60s.
 * Documentos baixam como anexo; foto/vídeo/áudio abrem na tela.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Anexo inválido.", 400);
  if (!(await rateLimit(`dl:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }

  const { data: att } = await ctx.sb
    .from("attachments")
    .select("id, storage_path, mime, filename, messages!inner(type)")
    .eq("id", id)
    .maybeSingle() as {
      data: { id: string; storage_path: string; mime: string; filename: string; messages: { type: string } } | null;
    };
  if (!att) return apiError("Não encontramos isso. Pode ter sido apagado.", 404);

  const admin = supabaseAdmin();
  const forceDownload = att.messages.type === "file";
  const { data, error } = await admin.storage
    .from("chat-media")
    .createSignedUrl(att.storage_path, 60, forceDownload ? { download: att.filename || "arquivo" } : undefined);
  if (error || !data?.signedUrl) return apiError("Não foi possível abrir o arquivo. Tente de novo.", 500);
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
