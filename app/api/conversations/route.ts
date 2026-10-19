import { type NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { createConversationSchema } from "@/lib/schemas";
import { clientIp, envLimit, rateLimit, audit } from "@/lib/security";
import type { ConversationItem } from "@/lib/supabase/types";

/** GET /api/conversations — lista ordenada por atividade (via RPC seguro). */
export async function GET(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  void clientIp;
  void req;
  const { data, error } = await ctx.sb.rpc("get_conversations");
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ conversations: (data ?? []) as ConversationItem[] });
}

/**
 * POST /api/conversations — cria ou abre a DM ({ username }) ou cria grupo
 * ({ group: { title, member_ids } }). Valida bloqueio/privacidade no servidor.
 */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`dm:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  void clientIp;
  let parsed: z.infer<typeof createConversationSchema>;
  try {
    parsed = createConversationSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  if ("group" in parsed) {
    const { data, error } = await ctx.sb.rpc("create_group", {
      p_title: parsed.group.title,
      p_member_ids: parsed.group.member_ids,
    });
    if (error) {
      const m = rpcErrorMessage(error);
      return apiError(m.message, m.status);
    }
    const row = data as { id: string };
    await audit(ctx.user.id, "group_created", { conversation_id: row.id });
    return NextResponse.json({ id: row.id, created: true });
  }
  const { data, error } = await ctx.sb.rpc("create_dm", { p_username: parsed.username });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  const row = data as { id: string; created: boolean };
  if (row.created) await audit(ctx.user.id, "dm_created", { conversation_id: row.id });
  return NextResponse.json(row);
}
