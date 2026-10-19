import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authed, apiError } from "@/app/api/_helpers";
import { uuidSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

const AVATAR_MIMES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX = 5 * 1024 * 1024;

async function myRole(sb: SupabaseClient, convId: string, userId: string): Promise<string | null> {
  const { data } = await sb
    .from("conversation_members")
    .select("role")
    .eq("conversation_id", convId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: string } | null)?.role ?? null;
}

/**
 * POST /api/conversations/[id]/avatar (multipart: file) — foto do grupo (admin+).
 * O cliente já manda recortada/quadrada; o servidor valida tipo e tamanho.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Conversa inválida.", 400);
  if (!(await rateLimit(`grp:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const role = await myRole(ctx.sb, id, ctx.user.id);
  if (!role) return apiError("Você não tem permissão para isso.", 403);
  if (role !== "owner" && role !== "admin") {
    return apiError("Só administradores do grupo podem fazer isso.", 403);
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError("Envio inválido.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return apiError("Escolha uma foto.", 400);
  if (!AVATAR_MIMES.includes(file.type)) return apiError("Use uma foto JPG, PNG ou WebP.", 400);
  if (file.size > AVATAR_MAX) return apiError("Foto grande demais (máximo 5 MB).", 400);

  const admin = supabaseAdmin();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upError } = await admin.storage
    .from("chat-media")
    .upload(`groups/${id}/avatar`, bytes, { contentType: file.type, upsert: true });
  if (upError) return apiError("Não foi possível enviar a foto. Tente de novo.", 500);

  const url = `/api/groups/${id}/avatar`;
  const { error: dbError } = await admin
    .from("conversations")
    .update({ avatar_url: url })
    .eq("id", id)
    .eq("type", "group");
  if (dbError) return apiError("Não foi possível salvar. Tente de novo.", 500);
  return NextResponse.json({ url });
}
