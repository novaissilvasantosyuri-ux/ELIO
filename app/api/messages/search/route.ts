import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError } from "@/app/api/_helpers";
import { uuidSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";

/** GET /api/messages/search?conversation_id=...&q=... — busca na conversa (RLS: só membros). */
export async function GET(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const conv = req.nextUrl.searchParams.get("conversation_id") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!uuidSchema.safeParse(conv).success || q.length < 2) {
    return NextResponse.json({ messages: [] });
  }
  // membro? (anti-IDOR explícito)
  const { data: mem } = await ctx.sb
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conv)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!mem) return apiError("Você não tem permissão para isso.", 403);

  // ilike escapado (% e _ viram literais)
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await ctx.sb
    .from("messages")
    .select("id, conversation_id, sender_id, type, body, created_at")
    .eq("conversation_id", conv)
    .ilike("body", like)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return apiError("Não foi possível buscar. Tente de novo.", 500);

  // enriquece com nome do remetente (batch)
  const ids = [...new Set((data ?? []).map((m) => m.sender_id).filter((s): s is string => !!s))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await ctx.sb.from("profiles").select("id, display_name").in("id", ids);
    (profs ?? []).forEach((p: { id: string; display_name: string }) => {
      names.set(p.id, p.id === ctx.user.id ? "Você" : p.display_name);
    });
  }
  const out = (data ?? []).map((m) => ({
    ...m,
    client_id: null,
    reply_to_id: null,
    reply_preview: null,
    is_edited: false,
    edited_at: null,
    sender_name: m.sender_id ? (names.get(m.sender_id) ?? "") : "Equipe ELIO",
    sender_avatar: null,
    delivered_at: null,
    read_at: null,
  }));
  return NextResponse.json({ messages: out });
}
