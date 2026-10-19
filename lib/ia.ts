/**
 * Elio IA (Fase 5): prompt do sistema + montagem do histórico.
 * Puro e testável (a chamada HTTP fica na rota /api/ia).
 */

export const IA_SYSTEM_PROMPT =
  "Você é a Elio IA, a assistente do aplicativo de mensagens Elio. " +
  "Fale português do Brasil, de um jeito simples, caloroso e direto. " +
  "Ajude a escrever, resumir, revisar textos e organizar ideias. " +
  "Respostas curtas por padrão (até cerca de 120 palavras), a não ser que peçam detalhe. " +
  "Nunca invente recursos do app; se não souber algo, diga com honestidade. " +
  "Nunca afirme ser uma pessoa humana.";

export interface IaTurn {
  role: "user" | "model";
  text: string;
}

export interface IaHistoryMsg {
  mine: boolean;
  is_ai: boolean;
  type: string;
  body: string;
}

/**
 * Monta os turnos para o Gemini: só texto, cronológicos, começando com 'user'
 * (exigência da API). Sistema e mídia ficam de fora.
 */
export function buildContents(history: IaHistoryMsg[], maxTurns = 20): IaTurn[] {
  const turns: IaTurn[] = [];
  for (const m of history) {
    if (m.type !== "text" || !m.body.trim()) continue;
    if (!m.mine && !m.is_ai) continue;
    turns.push({ role: m.is_ai ? "model" : "user", text: m.body.slice(0, 2000) });
  }
  while (turns.length > 0 && turns[0]?.role !== "user") turns.shift();
  return turns.slice(-maxTurns);
}

/** Texto de fallback quando o provedor falha (a conversa não fica sem resposta). */
export function iaFallback(): string {
  return "Ih, não consegui pensar agora 🤖 Tente de novo em instantes.";
}
