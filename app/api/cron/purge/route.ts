import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/app/api/_helpers";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/cron/purge — apaga mensagens expiradas + arquivos órfãos.
 * Protegida por segredo (header x-cron-secret). Chame 1x/dia (cron do Supabase/Vercel).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return apiError("Você não tem permissão para isso.", 403);
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("purge_expired_messages");
  if (error) return apiError("Não foi possível expurgar. Tente de novo.", 500);
  const row = (data ?? {}) as { deleted?: number; paths?: string[] };
  const paths = (row.paths ?? []).filter((p) => typeof p === "string" && p.length > 0);
  if (paths.length > 0) {
    await admin.storage.from("chat-media").remove(paths).catch(() => undefined);
  }
  return NextResponse.json({ deleted: row.deleted ?? 0, files: paths.length });
}
