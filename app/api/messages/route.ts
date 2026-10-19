import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { paginationSchema, sendMessageSchema } from "@/lib/schemas";
import { clientIp, envLimit, rateLimit } from "@/lib/security";
import type { MessageItem } from "@/lib/supabase/types";
import { notifyConversation } from "@/lib/push";

/** GET /api/messages?conversation_id=...&before_at=...&before_id=...&limit=30 — histórico paginado. */
export async function GET(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  void clientIp;
  const q = req.nextUrl.searchParams;
  const conv = q.get("conversation_id") ?? "";
  let page: { before_at?: string; before_id?: string; limit: number };
  try {
    page = paginationSchema.parse({
      before_at: q.get("before_at") ?? undefined,
      before_id: q.get("before_id") ?? undefined,
      limit: q.get("limit") ?? undefined,
    });
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("get_messages", {
    p_conv: conv,
    p_before_at: page.before_at ?? null,
    p_before_id: page.before_id ?? null,
    p_limit: page.limit,
  });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ messages: (data ?? []) as MessageItem[] });
}

/** POST /api/messages — envia (idempotente por client_id; valida bloqueio/privacidade). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`msg:${ctx.user.id}`, envLimit("RATE_MESSAGE_PER_MIN", 60)))) {
    return apiError("Você está enviando rápido demais. Respire e tente de novo.", 429);
  }
  void clientIp;
  let body: unknown;
  try {
    body = sendMessageSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const b = body as { conversation_id: string; client_id: string; body: string; reply_to_id?: string | null };
  const { data, error } = await ctx.sb.rpc("send_message", {
    p_conv: b.conversation_id,
    p_client_id: b.client_id,
    p_body: b.body,
    p_reply_to: b.reply_to_id ?? null,
  });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  // push (não atrasa a resposta; nunca quebra o envio)
  void notifyConversation(ctx.sb, b.conversation_id, ctx.user.id, b.body);
  return NextResponse.json(data);
}
