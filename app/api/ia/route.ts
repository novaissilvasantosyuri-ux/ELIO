import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { iaChatSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";
import { buildContents, iaFallback, IA_SYSTEM_PROMPT } from "@/lib/ia";
import type { MessageItem } from "@/lib/supabase/types";

interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

/**
 * POST /api/ia { text } — pergunta para a Elio IA (Gemini).
 * Salva a pergunta, chama o provedor e salva a resposta. Limite diário por env.
 */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`ia:${ctx.user.id}`, envLimit("RATE_IA_PER_MIN", 20)))) {
    return apiError("Calma, estou pensando! Tente de novo em instantes.", 429);
  }
  let body: { text: string; client_id: string };
  try {
    body = iaChatSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const text = body.text;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return apiError("A Elio IA ainda não foi configurada (fala com quem instalou o Elio).", 503);
  }

  const { data: chat, error: chatError } = await ctx.sb.rpc("get_or_create_ai_chat");
  if (chatError) {
    const m = rpcErrorMessage(chatError);
    return apiError(m.message, m.status);
  }
  const convId = (chat as { id: string }).id;

  // limite diário (melhor esforço: se a contagem falhar, deixa passar)
  const daily = Number(process.env.AI_DAILY_LIMIT ?? 30);
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await ctx.sb
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId)
      .eq("sender_id", ctx.user.id)
      .gte("created_at", today.toISOString());
    if ((count ?? 0) >= daily) {
      return apiError(`Você usou suas ${daily} perguntas de hoje. Volte amanhã! 🤖`, 429);
    }
  } catch {
    /* segue o jogo */
  }

  const { error: sendError } = await ctx.sb.rpc("send_message", {
    p_conv: convId,
    p_client_id: body.client_id,
    p_body: text,
  });
  if (sendError) {
    const m = rpcErrorMessage(sendError);
    return apiError(m.message, m.status);
  }

  // histórico recente para contexto
  let turns: Array<{ role: "user" | "model"; text: string }> = [{ role: "user", text }];
  try {
    const { data: hist } = await ctx.sb.rpc("get_messages", {
      p_conv: convId,
      p_before_at: null,
      p_before_id: null,
      p_limit: 20,
    });
    const items = ((hist ?? []) as MessageItem[]).slice().reverse();
    const built = buildContents(
      items.map((m) => ({ mine: m.sender_id === ctx.user.id, is_ai: m.is_ai, type: m.type, body: m.body })),
    );
    if (built.length > 0) turns = built;
  } catch {
    /* sem contexto, só a pergunta */
  }

  const model = process.env.AI_MODEL ?? "gemini-2.5-flash";
  let answer: string | null = null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: IA_SYSTEM_PROMPT }] },
          contents: turns.map((x) => ({ role: x.role, parts: [{ text: x.text }] })),
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as GeminiResponse;
      answer =
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() || null;
    }
  } catch {
    answer = null;
  }

  const degraded = !answer;
  const { data: reply, error: replyError } = await ctx.sb.rpc("ai_reply", {
    p_conv: convId,
    p_body: (answer ?? iaFallback()).slice(0, 4000),
  });
  if (replyError) {
    const m = rpcErrorMessage(replyError);
    return apiError(m.message, m.status);
  }
  await audit(ctx.user.id, "ia_asked", { conversation_id: convId, degraded });
  return NextResponse.json({ ...(reply as { message: MessageItem }), degraded });
}
