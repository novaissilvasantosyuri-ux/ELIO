import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { mediaMetaSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { envLimit, rateLimit } from "@/lib/security";
import { MEDIA_PUSH_LABEL, notifyConversation } from "@/lib/push";

const MB = 1024 * 1024;
/** Limite por tipo (o cliente comprime imagem antes; o servidor confere tudo). */
const LIMITS: Record<string, number> = { image: 10 * MB, video: 50 * MB, audio: 10 * MB, file: 25 * MB };
/** Mimes aceitos (lista fechada; nada executável, nada que rode script). */
const ALLOWED: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"],
  file: [
    "application/pdf", "text/plain", "text/markdown", "text/csv",
    "application/zip", "application/x-rar-compressed", "application/x-7z-compressed",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

function kindOf(mime: string): string | null {
  if (mime.startsWith("image/")) return ALLOWED.image!.includes(mime) ? "image" : null;
  if (mime.startsWith("video/")) return ALLOWED.video!.includes(mime) ? "video" : null;
  if (mime.startsWith("audio/")) return ALLOWED.audio!.includes(mime) ? "audio" : null;
  return ALLOWED.file!.includes(mime) ? "file" : null;
}

function safeName(name: string): string {
  const base = name.split("/").pop()?.split("\\").pop() ?? "arquivo";
  const clean = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return clean.length > 0 ? clean : "arquivo";
}

/**
 * POST /api/media (multipart) — envia foto/vídeo/áudio/arquivo.
 * Campos: conversation_id, client_id, reply_to_id?, caption?, width?, height?,
 * duration_s?, file. O arquivo vai para o bucket privado; o RPC cria msg + anexo.
 */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`media:${ctx.user.id}`, envLimit("RATE_MEDIA_PER_MIN", 20)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError("Envio inválido.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return apiError("Escolha um arquivo.", 400);
  }
  let meta: {
    conversation_id: string; client_id: string; reply_to_id?: string | null;
    caption?: string; width?: number | null; height?: number | null; duration_s?: number | null;
  };
  try {
    meta = mediaMetaSchema.parse({
      conversation_id: form.get("conversation_id"),
      client_id: form.get("client_id"),
      reply_to_id: form.get("reply_to_id") || undefined,
      caption: form.get("caption") ?? "",
      width: form.get("width") || undefined,
      height: form.get("height") || undefined,
      duration_s: form.get("duration_s") || undefined,
    });
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }

  const kind = kindOf(file.type);
  if (!kind) return apiError("Tipo de arquivo não suportado.", 400);
  if (file.size > (LIMITS[kind] ?? MB)) {
    return apiError(`Arquivo grande demais (máximo ${Math.round((LIMITS[kind] ?? MB) / MB)} MB).`, 400);
  }

  // checagens rápidas antes de subir o arquivo (o RPC confere tudo de novo)
  const { data: mem } = await ctx.sb
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", meta.conversation_id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!mem) return apiError("Você não tem permissão para isso.", 403);

  // idempotência: reenvio não sobe o arquivo de novo
  const { data: existing } = await ctx.sb
    .from("messages")
    .select("id")
    .eq("sender_id", ctx.user.id)
    .eq("client_id", meta.client_id)
    .maybeSingle();
  if (existing) return NextResponse.json({ message: existing, duplicate: true });

  const filename = safeName(file.name || "arquivo");
  const path = `${meta.conversation_id}/${meta.client_id}/${Date.now()}-${filename}`;
  const admin = supabaseAdmin();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upError } = await admin.storage
    .from("chat-media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upError) return apiError("Não foi possível enviar o arquivo. Tente de novo.", 500);

  const { data, error } = await ctx.sb.rpc("send_media", {
    p_conv: meta.conversation_id,
    p_client_id: meta.client_id,
    p_type: kind,
    p_caption: meta.caption ?? "",
    p_reply_to: meta.reply_to_id ?? null,
    p_path: path,
    p_mime: file.type,
    p_size: file.size,
    p_filename: filename,
    p_width: meta.width ?? null,
    p_height: meta.height ?? null,
    p_duration: meta.duration_s ?? null,
  });
  if (error) {
    // evita arquivo órfão (melhor esforço)
    await admin.storage.from("chat-media").remove([path]).catch(() => undefined);
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  // push (não atrasa a resposta; nunca quebra o envio)
  void notifyConversation(
    ctx.sb,
    meta.conversation_id,
    ctx.user.id,
    (meta.caption ?? "").trim() || MEDIA_PUSH_LABEL[kind] || "📎 Arquivo",
  );
  return NextResponse.json(data);
}
