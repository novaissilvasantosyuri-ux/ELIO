"use client";

/**
 * Hooks do chat: lista de conversas + conversa aberta (tempo real, recibos, fila offline).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { publishTyping, subscribeConversation, subscribeInbox, unsubscribe } from "@/lib/realtime";
import { outbox, type OutboxItem } from "@/lib/offline";
import { friendlyError, playPop, uid } from "@/lib/utils";
import { useApp, useToast } from "@/components/providers";
import { t } from "@/lib/i18n";
import type { ConversationItem, MessageItem } from "@/lib/supabase/types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? "Erro de rede.");
  return json as T;
}

/* ================= LISTA ================= */

export function useConversationList() {
  const { user, settings, presenceMap, configured } = useApp();
  const { toast } = useToast();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const soundOn = settings?.sound_enabled ?? true;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const { conversations } = await api<{ conversations: ConversationItem[] }>("/api/conversations");
      setItems(conversations);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // tempo real: qualquer novidade atualiza a lista (com som quando é mensagem nova alheia)
  useEffect(() => {
    if (!user || !configured) return;
    const sb = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 350);
    };
    const ch = subscribeInbox(sb, {
      onMessageInsert: (row) => {
        if (row.sender_id !== user.id && row.sender_id !== null && soundRef.current) playPop();
        debounced();
      },
      onMessageDelete: debounced,
      onReceipt: debounced,
      onMembers: debounced,
      onConversation: debounced,
      onResync: () => void refresh(),
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe(sb, ch);
    };
  }, [user, configured, refresh]);

  // aplica presença ao vivo nos peers
  const withPresence = useMemo(
    () =>
      items.map((c) =>
        c.peer && presenceMap[c.peer.id]
          ? { ...c, peer: { ...c.peer, ...presenceMap[c.peer.id] } }
          : c,
      ),
    [items, presenceMap],
  );

  const totalUnread = useMemo(
    () => withPresence.filter((c) => !c.archived_at).reduce((n, c) => n + (c.unread_count ?? 0), 0),
    [withPresence],
  );

  const patch = useCallback(async (id: string, body: Record<string, unknown>, onOk?: () => void) => {
    try {
      await api(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      onOk?.();
      await refresh();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }, [refresh, toast]);

  return { items: withPresence, loading, error, refresh, totalUnread, patch };
}

/* ================= CONVERSA ABERTA ================= */

export interface OptimisticMsg extends MessageItem {
  _pending?: boolean;
  _failed?: boolean;
}

export function useConversation(conversationId: string | null) {
  const { user, settings, presenceMap, configured } = useApp();
  const { toast } = useToast();
  const [meta, setMeta] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<OptimisticMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  /** Incrementa quando algo muda (edição/fixar) — a barra de fixadas recarrega. */
  const [pinsTick, setPinsTick] = useState(0);

  const convRef = useRef(conversationId);
  convRef.current = conversationId;
  const userRef = useRef(user);
  userRef.current = user;
  const readOn = settings?.read_receipts ?? true;
  const readRef = useRef(readOn);
  readRef.current = readOn;

  const loadMeta = useCallback(async () => {
    if (!conversationId || !user) return;
    try {
      const { conversations } = await api<{ conversations: ConversationItem[] }>("/api/conversations");
      const found = conversations.find((c) => c.id === conversationId) ?? null;
      if (found && found.type === "channel") {
        // Fase 3: canais de anúncios podem ser só-leitura para membros comuns.
        try {
          const info = await api<{ can_post: boolean }>(`/api/channels/${conversationId}`);
          found.can_post = info.can_post;
        } catch {
          found.can_post = true;
        }
      }
      setMeta(found);
      if (!found) setError("not-found");
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [conversationId, user]);

  const loadPage = useCallback(
    async (opts: { before_at?: string; before_id?: string } | null, initial = false) => {
      if (!conversationId) return;
      if (initial) setLoading(true);
      else setLoadingMore(true);
      try {
        const q = new URLSearchParams({ conversation_id: conversationId, limit: "30" });
        if (opts?.before_at && opts.before_id) {
          q.set("before_at", opts.before_at);
          q.set("before_id", opts.before_id);
        }
        const { messages: page } = await api<{ messages: MessageItem[] }>(`/api/messages?${q.toString()}`);
        if (convRef.current !== conversationId) return;
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const fresh = page.filter((m) => !ids.has(m.id));
          // páginas antigas vão para o começo; a inicial substitui
          const next = initial ? [...fresh].reverse() : [...fresh].reverse().concat(prev);
          return next;
        });
        setHasMore(page.length >= 30);
        setError(null);
      } catch (e) {
        if (initial) setError(friendlyError(e));
        else toast(friendlyError(e), "error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [conversationId, toast],
  );

  const refresh = useCallback(() => {
    setMessages([]);
    setHasMore(true);
    void loadMeta();
    void loadPage(null, true);
  }, [loadMeta, loadPage]);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setTypingUsers({});
    setError(null);
    if (conversationId && user) {
      void loadMeta();
      void loadPage(null, true);
    } else {
      setLoading(false);
    }
  }, [conversationId, user, loadMeta, loadPage]);

  // confirma entregues/lidos (em lote, com debounce)
  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDelivered = useRef<Set<string>>(new Set());
  const pendingRead = useRef<Set<string>>(new Set());
  const flushReceipts = useCallback(async () => {
    const conv = convRef.current;
    const u = userRef.current;
    if (!conv || !u) return;
    const delivered = [...pendingDelivered.current];
    const read = readRef.current ? [...pendingRead.current] : [];
    pendingDelivered.current.clear();
    pendingRead.current.clear();
    if (delivered.length === 0 && read.length === 0) return;
    try {
      await api("/api/receipts", {
        method: "POST",
        body: JSON.stringify({ conversation_id: conv, delivered_ids: delivered, read_ids: read }),
      });
      if (read.length > 0) {
        setMeta((m) => (m ? { ...m, unread_count: 0, my_last_read_at: new Date().toISOString() } : m));
      }
    } catch {
      /* tenta de novo na próxima */
      delivered.forEach((id) => pendingDelivered.current.add(id));
      read.forEach((id) => pendingRead.current.add(id));
    }
  }, []);
  const queueReceipts = useCallback(
    (msgs: MessageItem[]) => {
      const u = userRef.current;
      if (!u) return;
      let changed = false;
      for (const m of msgs) {
        if (m.sender_id === null || m.sender_id === u.id) continue;
        if (!m.delivered_at) {
          pendingDelivered.current.add(m.id);
          changed = true;
        }
        pendingRead.current.add(m.id);
        changed = true;
      }
      if (!changed) return;
      if (receiptTimer.current) clearTimeout(receiptTimer.current);
      receiptTimer.current = setTimeout(() => void flushReceipts(), 600);
    },
    [flushReceipts],
  );

  // busca as últimas e mescla (usado após enviar mídia)
  const syncLatest = useCallback(async () => {
    if (!conversationId) return;
    try {
      const q = new URLSearchParams({ conversation_id: conversationId, limit: "5" });
      const { messages: latest } = await api<{ messages: MessageItem[] }>(`/api/messages?${q.toString()}`);
      if (convRef.current !== conversationId) return;
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const fresh = latest.filter((m) => !ids.has(m.id));
        return [...prev, ...fresh.reverse()];
      });
      queueReceipts(latest);
      await loadMeta();
    } catch {
      /* próximo resync pega */
    }
  }, [conversationId, queueReceipts, loadMeta]);

  // marca o que já veio no histórico
  useEffect(() => {
    if (messages.length > 0 && document.visibilityState === "visible") queueReceipts(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // tempo real da conversa
  useEffect(() => {
    if (!conversationId || !user || !configured) return;
    const sb = supabaseBrowser();
    const knownIds = new Set<string>();
    const ch: RealtimeChannel = subscribeConversation(sb, conversationId, {
      onMessageInsert: (row) => {
        const id = row.id as string | undefined;
        if (!id || knownIds.has(id)) return;
        knownIds.add(id);
        // casa com o otimista pelo client_id; senão, busca a linha completa
        const clientId = row.client_id as string | undefined;
        setMessages((prev) => {
          if (clientId && prev.some((m) => m.client_id === clientId)) {
            return prev.map((m) =>
              m.client_id === clientId
                ? { ...m, id, _pending: false as const, created_at: (row.created_at as string) ?? m.created_at }
                : m,
            );
          }
          return prev;
        });
        // precisa da linha enriquecida? busca só ela (barato e simples)
        if (row.sender_id !== user.id) {
          void (async () => {
            try {
              const q = new URLSearchParams({ conversation_id: conversationId, limit: "5" });
              const { messages: latest } = await api<{ messages: MessageItem[] }>(`/api/messages?${q.toString()}`);
              if (convRef.current !== conversationId) return;
              setMessages((prev) => {
                const ids = new Set(prev.map((m) => m.id));
                const fresh = latest.filter((m) => !ids.has(m.id));
                return [...prev, ...fresh.reverse()];
              });
              queueReceipts(latest);
            } catch {
              /* próximo resync pega */
            }
          })();
        }
      },
      onMessageDelete: (id) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      },
      onMessageUpdate: (row) => {
        const id = row.id as string | undefined;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  body: row.body === undefined ? m.body : (row.body as string),
                  is_edited: row.is_edited === undefined ? m.is_edited : (row.is_edited as boolean),
                  edited_at: row.edited_at === undefined ? m.edited_at : (row.edited_at as string | null),
                  pinned_at: row.pinned_at === undefined ? m.pinned_at : (row.pinned_at as string | null),
                  pinned_by: row.pinned_by === undefined ? m.pinned_by : (row.pinned_by as string | null),
                }
              : m,
          ),
        );
        setPinsTick((t) => t + 1);
      },
      onReaction: ({ message_id, user_id, emoji, removed }) => {
        const me = userRef.current?.id;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== message_id) return m;
            const counts = [...(m.reactions ?? [])];
            const ix = counts.findIndex((c) => c.emoji === emoji);
            if (removed) {
              if (ix < 0) return m;
              const current = counts[ix]!;
              const mine = user_id === me ? false : current.mine;
              if (current.count <= 1) counts.splice(ix, 1);
              else counts[ix] = { ...current, count: current.count - 1, mine };
            } else {
              if (ix < 0) counts.push({ emoji, count: 1, mine: user_id === me });
              else {
                const current = counts[ix]!;
                counts[ix] = { ...current, count: current.count + 1, mine: current.mine || user_id === me };
              }
              counts.sort((a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : 1));
            }
            return { ...m, reactions: counts };
          }),
        );
      },
      onReceipt: (row) => {
        const mid = row.message_id as string | undefined;
        if (!mid) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === mid
              ? {
                  ...m,
                  delivered_at: (row.delivered_at as string | null) ?? m.delivered_at,
                  read_at: (row.read_at as string | null) ?? m.read_at,
                }
              : m,
          ),
        );
      },
      onTyping: (p) => {
        if (p.user_id === user.id) return;
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (p.is_typing) next[p.user_id] = Date.now();
          else delete next[p.user_id];
          return next;
        });
      },
      onMembers: () => void loadMeta(),
      onResync: () => refresh(),
    });
    return () => unsubscribe(sb, ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user, configured]);

  // expira o "digitando..." (5s)
  useEffect(() => {
    const t = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v < 5000) next[k] = v;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  /* ---------- envio (otimista + fila offline) ---------- */

  const actuallySend = useCallback(
    async (item: { client_id: string; conversation_id: string; body: string; reply_to_id: string | null }) => {
      const res = await api<{ message: Record<string, unknown>; duplicate: boolean }>("/api/messages", {
        method: "POST",
        body: JSON.stringify(item),
      });
      return res;
    },
    [],
  );

  const send = useCallback(
    async (body: string, replyToId: string | null) => {
      const conv = convRef.current;
      const u = userRef.current;
      if (!conv || !u || sending) return;
      const text = body.trim();
      if (!text) return;
      setSending(true);
      const clientId = uid();
      const optimistic: OptimisticMsg = {
        id: `temp-${clientId}`,
        conversation_id: conv,
        sender_id: u.id,
        client_id: clientId,
        type: "text",
        body: text,
        is_ai: false,
        reply_to_id: replyToId,
        reply_preview: null,
        is_edited: false,
        edited_at: null,
        created_at: new Date().toISOString(),
        sender_name: "Você",
        sender_avatar: null,
        delivered_at: null,
        read_at: null,
        forwarded: false,
        pinned_at: null,
        pinned_by: null,
        reactions: [],
        attachments: [],
        _pending: true,
      };
      // prévia da resposta (local, instantânea)
      if (replyToId) {
        const target = messages.find((m) => m.id === replyToId);
        if (target) {
          optimistic.reply_preview = {
            id: target.id,
            body: target.body.slice(0, 160),
            sender_name: target.sender_name,
            sender_id: target.sender_id,
          };
        }
      }
      setMessages((prev) => [...prev, optimistic]);
      try {
        if (!navigator.onLine) throw new Error("offline");
        const res = await actuallySend({ client_id: clientId, conversation_id: conv, body: text, reply_to_id: replyToId });
        const row = res.message as unknown as MessageItem;
        setMessages((prev) =>
          prev.map((m) =>
            m.client_id === clientId
              ? { ...optimistic, id: row.id, created_at: row.created_at, is_edited: row.is_edited, _pending: false }
              : m,
          ),
        );
        await outbox.remove(clientId).catch(() => {});
        await loadMeta();
      } catch {
        // sem conexão: guarda na fila e confirma quando voltar
        const item: OutboxItem = {
          client_id: clientId, conversation_id: conv, body: text,
          reply_to_id: replyToId, created_at: new Date().toISOString(), attempts: 0,
        };
        await outbox.add(item).catch(() => {});
        setMessages((prev) => prev.map((m) => (m.client_id === clientId ? { ...m, _pending: true } : m)));
      } finally {
        setSending(false);
      }
    },
    [actuallySend, loadMeta, messages, sending],
  );

  /**
   * Envio para a Elio IA (Fase 5): sem fila offline (IA precisa de internet).
   * No sucesso, troca o otimista pelo que veio do servidor.
   */
  const sendAi = useCallback(
    async (body: string) => {
      const conv = convRef.current;
      const u = userRef.current;
      if (!conv || !u || sending) return;
      const text = body.trim();
      if (!text) return;
      if (!navigator.onLine) {
        toast(t("ia.offline"), "error");
        return;
      }
      setSending(true);
      const clientId = uid();
      const optimistic: OptimisticMsg = {
        id: `temp-${clientId}`,
        conversation_id: conv,
        sender_id: u.id,
        client_id: clientId,
        type: "text",
        body: text,
        is_ai: false,
        reply_to_id: null,
        reply_preview: null,
        is_edited: false,
        edited_at: null,
        created_at: new Date().toISOString(),
        sender_name: "Você",
        sender_avatar: null,
        delivered_at: null,
        read_at: null,
        forwarded: false,
        pinned_at: null,
        pinned_by: null,
        reactions: [],
        attachments: [],
        _pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      try {
        await api<{ message: MessageItem; degraded: boolean }>("/api/ia", {
          method: "POST",
          body: JSON.stringify({ text, client_id: clientId }),
        });
        setMessages((prev) => prev.filter((m) => m.client_id !== clientId));
        await syncLatest();
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.client_id === clientId ? { ...m, _pending: false, _failed: true } : m)),
        );
        toast(friendlyError(e), "error");
      } finally {
        setSending(false);
      }
    },
    [sending, syncLatest, toast],
  );

  // reenvia a fila ao voltar a conexão (e a cada 15s, por garantia)
  useEffect(() => {
    let stop = false;
    const flush = async () => {
      if (stop || !navigator.onLine) return;
      const items = await outbox.list().catch(() => [] as OutboxItem[]);
      for (const it of items) {
        if (stop) return;
        try {
          const res = await actuallySend(it);
          const row = res.message as unknown as MessageItem;
          await outbox.remove(it.client_id).catch(() => {});
          setMessages((prev) =>
            prev.map((m) =>
              m.client_id === it.client_id
                ? { ...m, id: row.id, created_at: row.created_at, _pending: false, _failed: false }
                : m,
            ),
          );
        } catch {
          /* continua na fila */
        }
      }
      if (items.length > 0) void loadMeta();
    };
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const t = setInterval(() => void flush(), 15000);
    void flush();
    return () => {
      stop = true;
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
  }, [actuallySend, loadMeta]);

  const removeMessage = useCallback(
    async (id: string, scope: "me" | "all") => {
      try {
        await api(`/api/messages/${id}?scope=${scope}`, { method: "DELETE" });
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } catch (e) {
        toast(friendlyError(e), "error");
      }
    },
    [toast],
  );

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const oldest = messages[0];
    if (!oldest) return;
    void loadPage({ before_at: oldest.created_at, before_id: oldest.id });
  }, [loadingMore, hasMore, messages, loadPage]);

  const peerPresence = meta?.peer ? presenceMap[meta.peer.id] : undefined;
  const peerOnline =
    meta?.peer && peerPresence
      ? peerPresence.presence === "online"
      : meta?.peer
        ? meta.peer.presence === "online"
        : false;

  const isTyping = Object.keys(typingUsers).length > 0;

  return {
    meta, messages, loading, loadingMore, hasMore, error, isTyping, typingUsers,
    peerPresence, peerOnline, sending, pinsTick,
    send, sendAi, removeMessage, loadMore, refresh, loadMeta, setMeta, syncLatest,
  };
}

/* ---------- digitação (chamado pelo composer, com debounce próprio) ---------- */

export function useTypingSender(conversationId: string | null, enabled: boolean) {
  const { user } = useApp();
  const lastStart = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poke = useCallback(() => {
    if (!conversationId || !user || !enabled) return;
    const now = Date.now();
    if (now - lastStart.current > 3000) {
      lastStart.current = now;
      void publishTyping(supabaseBrowser(), conversationId, user.id, true);
    }
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      if (conversationId && user) void publishTyping(supabaseBrowser(), conversationId, user.id, false);
    }, 3500);
  }, [conversationId, user, enabled]);

  const stop = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (conversationId && user) void publishTyping(supabaseBrowser(), conversationId, user.id, false);
  }, [conversationId, user]);

  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
  }, []);

  return { poke, stop };
}
