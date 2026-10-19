import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Limite de requisições (janela de 1 minuto, guardado no Postgres).
 * SÓ usar no servidor. Retorna true se passou, false se estourou.
 */
export async function rateLimit(key: string, perMinute: number): Promise<boolean> {
  try {
    const admin = supabaseAdmin();
    const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
    // incremento atômico no banco (1 chamada = 1 contagem)
    const { data: row, error } = await admin.rpc("rate_limit_hit", {
      p_key: key,
      p_window: windowStart,
    });
    if (error) return false;
    const count = typeof row === "number" ? row : 1;
    return count <= perMinute;
  } catch {
    return false; // sem banco de limite, nega por segurança
  }
}

/** IP do chamador (para chaves de limite). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Registra ação de auditoria (sem conteúdo de mensagens, sem dados sensíveis). */
export async function audit(userId: string | null, action: string, meta?: Record<string, unknown>): Promise<void> {
  try {
    const admin = supabaseAdmin();
    await admin.from("audit_log").insert({ user_id: userId, action, metadata: meta ?? {} });
  } catch {
    /* auditoria nunca quebra a requisição */
  }
}

/** Lê um limite do env com padrão seguro. */
export function envLimit(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
