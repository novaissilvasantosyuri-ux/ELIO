"use client";

/**
 * Lista de mensagens: agrupamento, divisores de data, "não lidas",
 * rolagem infinita (mantém a posição), ticks, anexos, reações,
 * edição, encaminhar e fixar.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, CountBadge, Icon, Modal, Skeleton, Dropdown, type MenuItem } from "@/components/ui";
import { AttachmentView, Lightbox, ReactionPicker, ReactionsRow } from "@/components/chat/MessageParts";
import { useToast } from "@/components/providers";
import { cn, fmtDayDivider, fmtHour, linkify } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { ConversationItem } from "@/lib/supabase/types";
import type { OptimisticMsg } from "@/lib/chat-hooks";

export interface ListApi {
  scrollToBottom: (smooth?: boolean) => void;
  jumpTo: (id: string) => void;
}

interface Props {
  messages: OptimisticMsg[];
  meta: ConversationItem | null;
  myId: string;
  readOn: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onReply: (m: OptimisticMsg) => void;
  onDelete: (m: OptimisticMsg, scope: "me" | "all") => void;
  onReact: (m: OptimisticMsg, emoji: string) => void;
  onEdit: (m: OptimisticMsg, body: string) => Promise<boolean>;
  onForward: (m: OptimisticMsg) => void;
  onPin: (m: OptimisticMsg, pinned: boolean) => void;
  apiRef: React.MutableRefObject<ListApi | null>;
}

function Ticks({ m, readOn }: { m: OptimisticMsg; readOn: boolean }) {
  if (m.sender_id === null) return null;
  if (m._pending) return <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/60 border-t-transparent animate-spin" aria-label="enviando" />;
  const read = readOn && m.read_at;
  const delivered = m.delivered_at;
  const label = read ? "lida" : delivered ? "entregue" : "enviada";
  if (!delivered && !read) return <Icon name="check" size={15} className="text-white/90" aria-label={label} />;
  return (
    <span className={read ? "text-white" : "text-white/75"} aria-label={label}>
      <Icon name="checks" size={16} strokeWidth={read ? 2.4 : 1.8} />
    </span>
  );
}

function RichText({ text, sent }: { text: string; sent: boolean }) {
  const parts = useMemo(() => linkify(text), [text]);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.kind === "link" ? (
          <a
            key={i} href={p.href} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn("msg-link", sent ? "msg-sent" : "msg-received")}
          >
            {p.label}
          </a>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </span>
  );
}

function ReplyQuote({ m, onJump }: { m: OptimisticMsg; onJump: () => void }) {
  const r = m.reply_preview;
  if (!r) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onJump(); }}
      className="block w-full text-left mb-1 pl-2.5 border-l-[3px] rounded-r-lg py-1 pr-2 border-white/70 bg-black/10"
    >
      <span className="block text-[11px] font-bold opacity-90">{r.sender_name}</span>
      <span className="block text-[13px] opacity-80 line-clamp-2">{r.body || "(mensagem)"}</span>
    </button>
  );
}

export function MessageList({
  messages, meta, myId, readOn, loadingMore, hasMore,
  onLoadMore, onReply, onDelete, onReact, onEdit, onForward, onPin, apiRef,
}: Props) {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OptimisticMsg | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [awayUnread, setAwayUnread] = useState(0);
  const [reactFor, setReactFor] = useState<OptimisticMsg | null>(null);
  const [editing, setEditing] = useState<OptimisticMsg | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const nearBottom = useRef(true);
  const didInitialScroll = useRef(false);
  const adjust = useRef<{ h: number; top: number } | null>(null);
  const lastSeenId = useRef<string | null>(null);

  const myLastReadAt = meta?.my_last_read_at ?? null;

  const firstUnreadId = useMemo(() => {
    if (!myLastReadAt) return null;
    const m = messages.find((x) => x.sender_id !== null && x.sender_id !== myId && x.created_at > myLastReadAt);
    return m ? m.id : null;
  }, [messages, myLastReadAt, myId]);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setShowRecent(false);
    setAwayUnread(0);
  };

  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`[data-msg="${id}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightId(id);
      setTimeout(() => setHighlightId(null), 1600);
    } else {
      onLoadMore();
      toast("Carregando mensagens antigas para achar a original…", "info");
    }
  };

  useEffect(() => {
    apiRef.current = { scrollToBottom, jumpTo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rolagem inicial: divisor de não lidas ou fim
  useLayoutEffect(() => {
    if (didInitialScroll.current || messages.length === 0) return;
    didInitialScroll.current = true;
    if (firstUnreadId) {
      requestAnimationFrame(() => {
        scrollRef.current?.querySelector(`[data-msg="${firstUnreadId}"]`)?.scrollIntoView({ block: "start" });
      });
    } else {
      scrollToBottom(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // mensagens novas: desce se estou no fim; senão mostra pilula
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last || last.id === lastSeenId.current) return;
    lastSeenId.current = last.id;
    if (last.sender_id === myId || nearBottom.current) {
      scrollToBottom(false);
    } else {
      setAwayUnread((n) => n + 1);
      setShowRecent(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // mantém a posição ao carregar antigas
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && adjust.current) {
      el.scrollTop = el.scrollHeight - adjust.current.h + adjust.current.top;
      adjust.current = null;
    }
  }, [messages]);

  // sentinela do topo → paginação
  useEffect(() => {
    const el = topSentinel.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          adjust.current = { h: root.scrollHeight, top: root.scrollTop };
          onLoadMore();
        }
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottom.current = gap < 120;
    if (nearBottom.current) {
      setShowRecent(false);
      setAwayUnread(0);
    } else if (awayUnread === 0) {
      setShowRecent(true);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t("chat.copied"), "ok");
    } catch {
      toast(t("errors.generic"), "error");
    }
  };

  const saveEdit = async () => {
    if (!editing || editSaving) return;
    const v = editText.trim();
    if (!v || v === editing.body) {
      setEditing(null);
      return;
    }
    setEditSaving(true);
    try {
      const ok = await onEdit(editing, v);
      if (ok) setEditing(null);
    } finally {
      setEditSaving(false);
    }
  };

  let lastDay = "";
  let unreadShown = false;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 tablet:px-6 py-4" role="log" aria-label={t("nav.conversations")}>
        <div ref={topSentinel} aria-hidden="true" />
        {loadingMore && (
          <div className="flex flex-col gap-2 mb-3" aria-hidden="true">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-12 w-1/2 ml-auto" />
          </div>
        )}

        {messages.map((m, i) => {
          const mine = m.sender_id === myId;
          // Fase 5: resposta da IA tem sender null mas é bolha normal (esquerda).
          const isSystem = (m.type === "system" || m.sender_id === null) && !m.is_ai;
          const day = new Date(m.created_at).toDateString();
          const showDay = day !== lastDay;
          lastDay = day;
          const showUnread = !unreadShown && firstUnreadId === m.id;
          if (showUnread) unreadShown = true;
          const prev = messages[i - 1];
          const grouped =
            !showDay && !showUnread && prev && !isSystem &&
            prev.sender_id === m.sender_id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

          const canEdit =
            mine && m.type === "text" && !m._pending &&
            Date.now() - new Date(m.created_at).getTime() < 30 * 60 * 1000;
          const pinned = !!m.pinned_at;
          const isEditing = editing?.id === m.id;

          const menuItems: MenuItem[] = [
            { label: t("chat.react"), icon: "emoji", onSelect: () => setReactFor(m) },
            { label: t("chat.reply"), icon: "reply", onSelect: () => onReply(m) },
            ...(m.body
              ? [{ label: t("chat.copy"), icon: "copy" as const, onSelect: () => void copyText(m.body) }]
              : []),
            ...(canEdit
              ? [{
                  label: t("chat.edit"), icon: "edit" as const,
                  onSelect: () => { setEditing(m); setEditText(m.body); },
                }]
              : []),
            { label: t("chat.forward"), icon: "send", onSelect: () => onForward(m) },
            pinned
              ? { label: t("chat.unpin"), icon: "pin" as const, onSelect: () => onPin(m, false) }
              : { label: t("chat.pin"), icon: "pin" as const, onSelect: () => onPin(m, true) },
            { label: t("chat.deleteMe"), icon: "trash", danger: true, onSelect: () => setConfirmDelete(m) },
          ];

          return (
            <div key={m.id} data-msg={m.id} className="cv-row">
              {showDay && (
                <div className="flex justify-center my-3">
                  <span className="px-3 py-1 rounded-full bg-surface2/90 text-muted text-xs font-semibold shadow-sm">
                    {fmtDayDivider(m.created_at)}
                  </span>
                </div>
              )}
              {showUnread && (
                <div className="flex items-center gap-2 my-3" aria-label={t("chat.unreadDivider")}>
                  <span className="flex-1 h-px bg-accent/50" />
                  <span className="px-3 py-1 rounded-full bg-accent text-white text-xs font-bold">
                    {t("chat.unreadDivider")}
                  </span>
                  <span className="flex-1 h-px bg-accent/50" />
                </div>
              )}

              {isSystem ? (
                <div className="flex justify-center my-2 px-8">
                  <span className="px-3 py-1.5 rounded-2xl bg-surface2/95 text-muted text-[13px] text-center shadow-sm">
                    {m.body}
                  </span>
                </div>
              ) : (
                <div className={cn("flex items-end gap-1.5 mb-0.5", mine ? "justify-end" : "justify-start", grouped && "mt-0.5")}>
                  {!mine && !grouped && meta?.peer && (
                    <span className="w-7 shrink-0"><Avatar src={meta.peer.avatar_url} name={meta.peer.display_name} size="xs" /></span>
                  )}
                  {!mine && !grouped && !meta?.peer && m.is_ai && (
                    <span className="w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-white bg-gradient-to-br from-[var(--brand-deep)] to-[var(--accent)]">
                      <Icon name="sparkles" size={14} />
                    </span>
                  )}
                  {!mine && grouped && <span className="w-7 shrink-0" />}
                  <div className={cn("max-w-[78%] tablet:max-w-[70%] flex flex-col", mine ? "items-end" : "items-start")}>
                    {!mine && !grouped && meta?.type !== "direct" && (
                      <span className="text-[11px] font-bold text-[var(--brand)] ml-3 mb-0.5">{m.sender_name}</span>
                    )}
                    <div className="relative group">
                      <div
                        className={cn(
                          "px-3.5 py-2 text-[15px] leading-relaxed shadow-sm transition-all duration-200",
                          mine
                            ? "msg-sent bg-gradient-to-br from-sent-from to-sent-to text-white rounded-2xl rounded-br-md"
                            : "msg-received bg-bubble text-ink rounded-2xl rounded-bl-md",
                          highlightId === m.id && "ring-2 ring-accent",
                          m._pending && "opacity-80",
                        )}
                      >
                        {m.forwarded && (
                          <span className={cn("block text-[11px] italic mb-0.5", mine ? "text-white/85" : "text-muted")}>
                            ↪ {t("chat.forwarded")}
                          </span>
                        )}
                        {m.reply_preview && <ReplyQuote m={m} onJump={() => m.reply_to_id && jumpTo(m.reply_to_id)} />}
                        {(m.attachments ?? []).map((a) => (
                          <AttachmentView
                            key={a.id}
                            att={a}
                            mine={mine}
                            onOpenImage={(url, name) => setLightbox({ url, name })}
                          />
                        ))}
                        {isEditing ? (
                          <span className="block" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={3}
                              maxLength={4000}
                              autoFocus
                              aria-label={t("chat.editPh")}
                              className={cn(
                                "w-full min-w-52 rounded-xl px-3 py-2 text-[15px] outline-none resize-y",
                                mine ? "bg-black/20 text-white placeholder:text-white/60" : "bg-surface2 text-ink",
                              )}
                            />
                            <span className="flex gap-2 mt-2">
                              <Button size="sm" loading={editSaving} onClick={() => void saveEdit()}>
                                {t("chat.editSave")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                                {t("conversations.cancel")}
                              </Button>
                            </span>
                          </span>
                        ) : (
                          m.body && (
                            <span
                              className="block cursor-pointer"
                              onClick={() => setSelectedId((s) => (s === m.id ? null : m.id))}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") setSelectedId((s) => (s === m.id ? null : m.id));
                              }}
                            >
                              <RichText text={m.body} sent={mine} />
                            </span>
                          )
                        )}
                        {!isEditing && (
                          <span className={cn("flex items-center justify-end gap-1 mt-0.5 text-[11px]", mine ? "text-white/85" : "text-muted")}>
                            {pinned && <Icon name="pin" size={12} aria-label={t("chat.pin")} />}
                            {m.is_edited && <em className="not-italic opacity-80">{t("chat.edited")} · </em>}
                            {fmtHour(m.created_at)}
                            {mine && <Ticks m={m} readOn={readOn} />}
                          </span>
                        )}
                      </div>
                      {/* ações (hover no desktop, toque no texto seleciona) */}
                      <span className={cn(
                        "absolute top-1/2 -translate-y-1/2",
                        mine ? "-left-11" : "-right-11",
                        "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity",
                        selectedId === m.id && "opacity-100",
                      )}>
                        <Dropdown
                          align={mine ? "right" : "left"}
                          trigger={
                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-surface shadow-soft text-muted hover:text-ink cursor-pointer" role="button" aria-label={t("chat.menu")} tabIndex={0}>
                              <Icon name="dots" size={17} />
                            </span>
                          }
                          items={menuItems}
                        />
                      </span>
                    </div>
                    <ReactionsRow
                      reactions={m.reactions ?? []}
                      mine={mine}
                      onToggle={(emoji) => onReact(m, emoji)}
                      onMore={() => setReactFor(m)}
                    />
                  </div>
                  {mine && !grouped && <span className="w-1 shrink-0" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* leitor de tela: anuncia a última mensagem */}
      <span className="sr-only" aria-live="polite">
        {messages.length > 0
          ? `${messages[messages.length - 1]?.sender_name}: ${messages[messages.length - 1]?.body.slice(0, 120)}`
          : ""}
      </span>

      {/* voltar para a mais recente */}
      {showRecent && (
        <button
          onClick={() => scrollToBottom(true)}
          className="anim-pop absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 pl-3 pr-4 h-10 rounded-full bg-surface shadow-pop border border-line text-sm font-semibold"
        >
          <Icon name="chev-down" size={17} className="text-brand" />
          {t("chat.goRecent")}
          <CountBadge count={awayUnread} />
        </button>
      )}

      {/* reagir */}
      {reactFor && (
        <ReactionPicker
          onPick={(emoji) => { onReact(reactFor, emoji); setReactFor(null); }}
          onClose={() => setReactFor(null)}
        />
      )}

      {/* apagar: para mim e/ou para todos */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t("chat.deleteConfirmT")}>
        <p className="text-muted text-sm leading-relaxed">
          {confirmDelete?.sender_id === myId ? t("chat.deleteAllD") : t("chat.deleteMeD")}
        </p>
        <div className="flex flex-col gap-2.5 mt-5">
          <Button variant="secondary" full onClick={() => { if (confirmDelete) onDelete(confirmDelete, "me"); setConfirmDelete(null); }}>
            {t("chat.deleteMe")}
          </Button>
          {confirmDelete?.sender_id === myId && (
            <Button variant="danger" full onClick={() => { if (confirmDelete) onDelete(confirmDelete, "all"); setConfirmDelete(null); }}>
              {t("chat.deleteAll")}
            </Button>
          )}
          <Button variant="ghost" full onClick={() => setConfirmDelete(null)}>
            {t("conversations.cancel")}
          </Button>
        </div>
      </Modal>

      {/* foto em tela cheia */}
      {lightbox && (
        <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

// re-export para uso no cabeçalho
export { Avatar };
