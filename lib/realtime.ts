"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/* ============================================================
   ELIO — Contrato de eventos em tempo real (Fase 1)
   Conteúdo (mensagens, recibos, membros): Postgres Changes,
   autorizado no servidor pelo RLS (só membros recebem).
   Efêmeros (digitando): Broadcast por conversa (só IDs opacos).
   Presença: perfis (last_seen_at) via Postgres Changes.
   ============================================================ */

export type EventName =
  | "message:new"
  | "message:deleted"
  | "message:receipt"
  | "typing"
  | "presence"
  | "conversation:updated"
  | "member:changed";

export interface InboxHandlers {
  onMessageInsert?: (row: Record<string, unknown>) => void;
  onMessageDelete?: (row: Record<string, unknown>) => void;
  onReceipt?: (row: Record<string, unknown>) => void;
  onMembers?: (row: Record<string, unknown>) => void;
  onConversation?: (row: Record<string, unknown>) => void;
  /** Chamado quando o canal reconecta (hora de ressincronizar). */
  onResync?: () => void;
}

const typingPayload = z.object({
  user_id: z.string().uuid(),
  is_typing: z.boolean(),
  at: z.number(),
});
export type TypingPayload = z.infer<typeof typingPayload>;

/** Caixa de entrada global: tudo que o RLS permite este usuário ver. */
export function subscribeInbox(sb: SupabaseClient, h: InboxHandlers): RealtimeChannel {
  let everConnected = false;
  const ch = sb
    .channel("elio:inbox")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) =>
      h.onMessageInsert?.((p.new ?? {}) as Record<string, unknown>),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) =>
      h.onMessageDelete?.((p.old ?? {}) as Record<string, unknown>),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, (p) =>
      h.onReceipt?.(((p.new ?? p.old ?? {}) as Record<string, unknown>)),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, (p) =>
      h.onMembers?.(((p.new ?? p.old ?? {}) as Record<string, unknown>)),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, (p) =>
      h.onConversation?.((p.new ?? {}) as Record<string, unknown>),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (everConnected) h.onResync?.();
        everConnected = true;
      }
    });
  return ch;
}

export interface ConversationHandlers {
  onMessageInsert?: (row: Record<string, unknown>) => void;
  onMessageDelete?: (id: string) => void;
  /** UPDATE (edição, fixar): linha nova completa. */
  onMessageUpdate?: (row: Record<string, unknown>) => void;
  /**
   * Reação: { message_id, user_id, emoji, removed }.
   * Sem filtro por conversa (o RLS limita); o cliente filtra pelos ids abertos.
   */
  onReaction?: (info: { message_id: string; user_id: string; emoji: string; removed: boolean }) => void;
  onReceipt?: (row: Record<string, unknown>) => void;
  onTyping?: (payload: TypingPayload) => void;
  onMembers?: (row: Record<string, unknown>) => void;
  onResync?: () => void;
}

/** Canal de UMA conversa aberta (histórico ao vivo + digitando). */
export function subscribeConversation(
  sb: SupabaseClient,
  conversationId: string,
  h: ConversationHandlers,
): RealtimeChannel {
  let everConnected = false;
  const ch = sb
    .channel(`elio:conv:${conversationId}`, { config: { broadcast: { self: false } } })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (p) => h.onMessageInsert?.((p.new ?? {}) as Record<string, unknown>),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (p) => {
        const old = (p.old ?? {}) as Record<string, unknown>;
        if (typeof old.id === "string") h.onMessageDelete?.(old.id);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (p) => h.onMessageUpdate?.((p.new ?? {}) as Record<string, unknown>),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (p) => {
      const row = ((p.new ?? p.old ?? {}) as Record<string, unknown>);
      const message_id = row.message_id;
      const user_id = row.user_id;
      const emoji = row.emoji;
      if (typeof message_id === "string" && typeof user_id === "string" && typeof emoji === "string") {
        h.onReaction?.({ message_id, user_id, emoji, removed: p.eventType === "DELETE" });
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, (p) =>
      h.onReceipt?.(((p.new ?? p.old ?? {}) as Record<string, unknown>)),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversationId}` },
      (p) => h.onMembers?.(((p.new ?? p.old ?? {}) as Record<string, unknown>)),
    )
    .on("broadcast", { event: "typing" }, (p) => {
      const parsed = typingPayload.safeParse(p.payload);
      if (parsed.success) h.onTyping?.(parsed.data);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (everConnected) h.onResync?.();
        everConnected = true;
      }
    });
  return ch;
}

/** Presença: mudanças de perfis visíveis a mim (o RLS filtra no servidor). */
export function subscribeProfiles(
  sb: SupabaseClient,
  onProfile: (row: Record<string, unknown>) => void,
): RealtimeChannel {
  return sb
    .channel("elio:profiles")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (p) =>
      onProfile((p.new ?? {}) as Record<string, unknown>),
    )
    .subscribe();
}

/* ---------- digitação (publicação, com canal reutilizado) ---------- */

const typingChannels = new Map<string, RealtimeChannel>();

function typingChannel(sb: SupabaseClient, conversationId: string): RealtimeChannel {
  const key = conversationId;
  const existing = typingChannels.get(key);
  if (existing) return existing;
  const ch = sb.channel(`elio:conv:${conversationId}`, { config: { broadcast: { self: false } } });
  void ch.subscribe();
  typingChannels.set(key, ch);
  return ch;
}

/** Avisa "estou digitando" (o chamador controla o debounce). */
export async function publishTyping(
  sb: SupabaseClient,
  conversationId: string,
  userId: string,
  isTyping: boolean,
): Promise<void> {
  try {
    const ch = typingChannel(sb, conversationId);
    await ch.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: userId, is_typing: isTyping, at: Date.now() },
    });
  } catch {
    /* digitação é efêmera: falhar é ok */
  }
}

export function unsubscribe(sb: SupabaseClient, ch: RealtimeChannel | null): void {
  if (!ch) return;
  try {
    void sb.removeChannel(ch);
  } catch {
    /* ignora */
  }
}
