import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError } from "@/app/api/_helpers";
import { uuidSchema } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/groups/[id]/avatar — foto do grupo (só membros, URL assinada de 60s). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError("Conversa inválida.", 400);
  if (!(await rateLimit(`dl:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data: mem } = await ctx.sb
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!mem) return apiError("Você não tem permissão para isso.", 403);

  const admin = supabaseAdmin();
  const { data, error } = await admin.storage
    .from("chat-media")
    .createSignedUrl(`groups/${id}/avatar`, 60);
  if (error || !data?.signedUrl) return apiError("Grupo sem foto.", 404);
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
