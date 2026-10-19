import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, supabaseRoute } from "@/lib/supabase/route";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Resposta de erro padrão em pt-BR. */
export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Mapeia exceções dos RPCs para mensagens amigáveis (sem vazar detalhes). */
export function rpcErrorMessage(
  err: unknown,
  scope: "group" | "community" = "group",
): { message: string; status: number } {
  const msg = err instanceof Error ? err.message : String(err);
  const where = scope === "community" ? "comunidade" : "grupo";
  if (msg.includes("unauthorized")) return { message: "Sua sessão expirou. Entre de novo.", status: 401 };
  if (msg.includes("forbidden")) return { message: "Você não tem permissão para isso.", status: 403 };
  if (msg.includes("not_found")) return { message: "Não encontramos isso. Confira o @usuário.", status: 404 };
  if (msg.includes("blocked")) return { message: "Não é possível concluir por causa de um bloqueio.", status: 403 };
  if (msg.includes("not_allowed")) return { message: "Essa pessoa escolheu não receber isso (privacidade).", status: 403 };
  if (msg.includes("read_only")) return { message: "Esta conversa é somente leitura.", status: 403 };
  if (msg.includes("bad_timer")) return { message: "Escolha 24 horas, 7 dias ou desligado.", status: 400 };
  if (msg.includes("not_direct")) return { message: "Chamadas só funcionam em conversas 1-a-1.", status: 400 };
  if (msg.includes("busy")) return { message: "Já tem uma chamada acontecendo. Tente de novo já já.", status: 409 };
  if (msg.includes("expired")) return { message: "A chamada expirou.", status: 410 };
  if (msg.includes("name_taken")) return { message: "Já existe um canal com esse nome.", status: 409 };
  if (msg.includes("taken")) return { message: "Esse @usuário já está em uso.", status: 409 };
  if (msg.includes("limit_reached")) return { message: "Limite de trocas atingido (3 a cada 30 dias).", status: 429 };
  if (msg.includes("invalid_username") || msg.includes("invalid_body") || msg.includes("bad_reply")) {
    return { message: "Dados inválidos. Confira e tente de novo.", status: 400 };
  }
  if (msg.includes("needs_members")) return { message: "Escolha ao menos uma pessoa para o grupo.", status: 400 };
  if (msg.includes("too_many")) return { message: scope === "community" ? "A comunidade já tem 50 canais." : "Gente demais de uma vez. Tente com menos pessoas.", status: 400 };
  if (msg.includes("invalid_title")) return { message: `O nome precisa ter de 1 a 60 letras.`, status: 400 };
  if (msg.includes("invalid_description")) return { message: "A descrição pode ter no máximo 300 letras.", status: 400 };
  if (msg.includes("needs_admin")) return { message: `Só administradores ${where === "comunidade" ? "da comunidade" : "do grupo"} podem fazer isso.`, status: 403 };
  if (msg.includes("needs_owner")) return { message: `Só o dono ${where === "comunidade" ? "da comunidade" : "do grupo"} pode fazer isso.`, status: 403 };
  if (msg.includes("not_group")) return { message: "Isso só existe em grupos.", status: 400 };
  if (msg.includes("not_channel")) return { message: "Isso só existe em canais de comunidade.", status: 400 };
  if (msg.includes("last_channel")) return { message: "A comunidade precisa de ao menos um canal.", status: 400 };
  if (msg.includes("not_member")) return { message: `Essa pessoa não está ${where === "comunidade" ? "na comunidade" : "no grupo"}.`, status: 404 };
  if (msg.includes("use_leave")) return { message: `Para sair, use “Sair ${where === "comunidade" ? "da comunidade" : "do grupo"}”.`, status: 400 };
  if (msg.includes("cannot_remove_owner")) return { message: "O dono não pode ser removido. Transfira a posse primeiro.", status: 403 };
  if (msg.includes("bad_role")) return { message: "Papel inválido.", status: 400 };
  if (msg.includes("bad_code")) return { message: "Convite inválido ou expirado. Confira o código.", status: 404 };
  if (msg.includes("full")) return { message: scope === "community" ? "A comunidade está cheia (1000 pessoas)." : "O grupo está cheio (200 pessoas).", status: 409 };
  if (msg.includes("invalid_emoji")) return { message: "Escolha um emoji válido.", status: 400 };
  if (msg.includes("not_editable")) return { message: "Só dá para editar mensagem de texto.", status: 400 };
  if (msg.includes("too_old")) return { message: "Só dá para editar até 30 minutos depois de enviar.", status: 400 };
  if (msg.includes("not_forwardable")) return { message: "Essa mensagem não pode ser encaminhada.", status: 400 };
  if (msg.includes("not_pinnable")) return { message: "Essa mensagem não pode ser fixada.", status: 400 };
  if (msg.includes("invalid_type")) return { message: "Tipo de arquivo não suportado.", status: 400 };
  if (msg.includes("invalid_media")) return { message: "Arquivo inválido. Tente de novo.", status: 400 };
  if (msg.includes("too_big")) return { message: "Arquivo grande demais para enviar.", status: 400 };
  if (msg.includes("already")) return { message: "Vocês já são contatos.", status: 409 };
  if (msg.includes("pending")) return { message: "Já existe uma solicitação pendente.", status: 409 };
  if (msg.includes("self")) return { message: "Você não pode fazer isso com você mesmo. 🙂", status: 400 };
  return { message: "Algo não saiu como esperado. Tente de novo.", status: 500 };
}

export function zodError(e: ZodError) {
  const first = e.issues[0];
  return apiError(first ? `Campo inválido: ${first.path.join(".") || "dados"}` : "Dados inválidos.", 400);
}

/** Abre o cliente + exige login. Retorna null-able para a rota decidir o 401. */
export async function authed(): Promise<{ sb: SupabaseClient; user: User } | null> {
  const sb = await supabaseRoute();
  const user = await currentUser(sb);
  if (!user) return null;
  return { sb, user };
}
