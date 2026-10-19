"use client";

/**
 * Janela do chat: cabeçalho, papel de parede, mensagens e entrada.
 */
import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AvatarWithPresence, Dropdown, EmptyState, ErrorState, Icon, IconButton,
  Modal, Skeleton, type MenuItem,
} from "@/components/ui";
import { ElioMark } from "@/components/brand";
import { useApp, useToast } from "@/components/providers";
import { useCall } from "@/components/calls/CallProvider";
import { MessageList, type ListApi } from "@/components/chat/MessageList";
import { ForwardModal, PinnedBar } from "@/components/chat/MessageParts";
import { Composer } from "@/components/chat/Composer";
import { MessageSearch } from "@/components/chat/MessageSearch";
import { GroupInfo } from "@/components/groups/GroupInfo";
import { WallpaperModal } from "@/components/settings/WallpaperPicker";
import { useConversation, type OptimisticMsg } from "@/lib/chat-hooks";
import { fmtLastSeen, wallpaperOverlay, wallpaperStyle, friendlyError, cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useNow } from "@/lib/hooks";

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-1 ml-1" aria-hidden="true">
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-accent" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-accent" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-accent" />
    </span>
  );
}

const MUTE_OPTIONS = [
  { key: "1h", label: "1 hora", ms: 3600_000 },
  { key: "8h", label: "8 horas", ms: 8 * 3600_000 },
  { key: "1w", label: "1 semana", ms: 7 * 24 * 3600_000 },
  { key: "forever", label: "Para sempre", ms: null as number | null },
];

/** Timer de sumiço (Fase 4): rótulos resolvidos na hora (i18n). */
const TIMER_OPTIONS = [
  { seconds: 0, labelKey: "disappear.off" },
  { seconds: 86400, labelKey: "disappear.day" },
  { seconds: 604800, labelKey: "disappear.week" },
];

export function ChatWindow({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, settings, blocks, setBlocksLocal, presenceMap } = useApp();
  const conv = useConversation(conversationId);
  const call = useCall();
  const { meta } = conv;
  const [searchOpen, setSearchOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<OptimisticMsg | null>(null);
  const [forwardId, setForwardId] = useState<string | null>(null);
  const apiRef = useRef<ListApi | null>(null);
  const now = useNow();

  const showTyping = (settings?.typing_indicators ?? true) && conv.isTyping;
  const readOn = settings?.read_receipts ?? true;

  const peerLive = meta?.peer ? presenceMap[meta.peer.id] : undefined;
  const peerPresence = peerLive?.presence ?? meta?.peer?.presence ?? "offline";
  const peerLastSeen = peerLive?.last_seen_at ?? meta?.peer?.last_seen_at ?? null;
  const effectivePresence = peerPresence === "invisible" ? "offline" : peerPresence;

  const isReadOnly =
    meta?.type === "official" ||
    meta?.type === "system" ||
    (meta?.type === "channel" && meta.can_post === false);
  const peerBlocked = meta?.peer ? blocks.has(meta.peer.id) : false;
  const convMuted = meta?.muted_until ? new Date(meta.muted_until).getTime() > Date.now() || meta.muted_until === null : false;

  const wallpaper = useMemo(() => {
    const override = meta?.wallpaper as { value?: { kind: string; id?: string; color?: string; url?: string }; blur?: number; dim?: number } | null;
    const global = settings?.wallpaper ?? { value: { kind: "default" as const }, blur: 0, dim: 0 };
    if (override && override.value && (override.value as { kind: string }).kind !== "default") {
      return {
        value: override.value as { kind: "gradient"; id: string } | { kind: "solid"; color: string } | { kind: "image"; url: string },
        blur: override.blur ?? 0,
        dim: override.dim ?? 0,
      };
    }
    return global as { value: { kind: "default" } | { kind: "gradient"; id: string } | { kind: "solid"; color: string } | { kind: "image"; url: string }; blur: number; dim: number };
  }, [meta?.wallpaper, settings?.wallpaper]);

  async function patchConv(body: Record<string, unknown>, okMsg?: string) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      if (okMsg) toast(okMsg, "ok");
      await conv.loadMeta();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function setTimer(seconds: number) {
    if (timerBusy) return;
    setTimerBusy(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/disappearing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("disappear.saved"), "ok");
      setTimerOpen(false);
      await conv.loadMeta();
      conv.refresh();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setTimerBusy(false);
    }
  }

  async function toggleBlock() {
    if (!meta?.peer) return;
    const peerId = meta.peer.id;
    try {
      const res = await fetch("/api/blocks", {
        method: peerBlocked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: peerId }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      const next = new Set(blocks);
      if (peerBlocked) next.delete(peerId);
      else next.add(peerId);
      setBlocksLocal(next);
      toast(peerBlocked ? "Desbloqueado." : "Bloqueado. A pessoa não foi avisada.", "ok");
      conv.refresh();
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function deleteConversation() {
    if (!window.confirm(t("conversations.deleteConfirmD"))) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      router.push("/conversas");
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function reactTo(m: OptimisticMsg, emoji: string) {
    try {
      const res = await fetch(`/api/messages/${m.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      // o tempo real atualiza as contagens; nada mais a fazer
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  async function editMessage(m: OptimisticMsg, body: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/messages/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("chat.editOk"), "ok");
      return true;
    } catch (e) {
      toast(friendlyError(e), "error");
      return false;
    }
  }

  async function pinMessage(m: OptimisticMsg, pinned: boolean) {
    try {
      const res = await fetch(`/api/messages/${m.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(pinned ? t("chat.pinnedUp") : t("chat.pinnedDown"), "ok");
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  if (!user) return null;

  if (conv.loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-surface tablet:rounded-3xl tablet:m-3 tablet:ml-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-[72px] border-b border-line">
          <Skeleton className="w-11 h-11 rounded-full" />
          <div className="flex-1"><Skeleton className="h-4 w-40 mb-1.5" /><Skeleton className="h-3 w-24" /></div>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-2">
          <Skeleton className="h-14 w-2/3 rounded-2xl" />
          <Skeleton className="h-14 w-1/2 ml-auto rounded-2xl" />
          <Skeleton className="h-14 w-3/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (conv.error === "not-found" || (!conv.loading && !meta)) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-surface tablet:rounded-3xl tablet:m-3 tablet:ml-0 p-6">
        <EmptyState icon="chat" title={t("errors.notFound")} action={onBack ? undefined : undefined} />
        {onBack && (
          <button onClick={onBack} className="mt-2 text-sm font-semibold text-brand">{t("a11y.back")}</button>
        )}
      </div>
    );
  }

  if (conv.error && !meta) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-surface tablet:rounded-3xl tablet:m-3 tablet:ml-0 p-6">
        <ErrorState message={conv.error} onRetry={conv.refresh} />
      </div>
    );
  }

  const menuItems: MenuItem[] = [
    ...(meta?.peer ? [{ label: t("chat.viewProfile"), icon: "user" as const, onSelect: () => router.push(`/perfil/${meta.peer!.username}`) }] : []),
    ...(meta?.type === "group" ? [{ label: t("groups.info"), icon: "users" as const, onSelect: () => setInfoOpen(true) }] : []),
    { label: t("chat.searchPh").replace("...", ""), icon: "search", onSelect: () => setSearchOpen(true) },
    { label: t("settings.wallpaper"), icon: "image", onSelect: () => setWallOpen(true) },
    ...(meta && (meta.type === "direct" || meta.type === "group" || meta.type === "channel")
      ? [{ label: t("disappear.menu"), icon: "clock" as const, onSelect: () => setTimerOpen(true) }]
      : []),
    convMuted
      ? { label: t("conversations.unmute"), icon: "bell", onSelect: () => void patchConv({ muted_until: null }) }
      : { label: t("conversations.mute"), icon: "bell-off", onSelect: () => setMuteOpen(true) },
    meta?.pinned_at
      ? { label: t("conversations.unpin"), icon: "pin", onSelect: () => void patchConv({ pinned: false }) }
      : { label: t("conversations.pin"), icon: "pin", onSelect: () => void patchConv({ pinned: true }) },
    { label: t("conversations.markUnread"), icon: "chat", onSelect: () => void patchConv({ mark_unread: true }) },
    meta?.archived_at
      ? { label: t("conversations.unarchive"), icon: "archive", onSelect: () => void patchConv({ archived: false }) }
      : { label: t("conversations.archive"), icon: "archive", onSelect: () => void patchConv({ archived: true }) },
    { label: t("chat.clearHistory"), icon: "trash", onSelect: () => { if (window.confirm(t("chat.clearConfirmD"))) void patchConv({ clear: true }).then(() => conv.refresh()); } },
    ...(meta?.peer
      ? [peerBlocked
          ? { label: t("profile.unblock"), icon: "block" as const, onSelect: () => void toggleBlock() }
          : { label: t("profile.block"), icon: "block" as const, danger: true, onSelect: () => void toggleBlock() }]
      : []),
    { label: t("conversations.delete"), icon: "trash", danger: true, onSelect: () => void deleteConversation() },
  ];

  const subtitle = showTyping ? (
    <span className="text-accent font-semibold">{t("conversations.typing")}<TypingDots /></span>
  ) : meta?.type === "ai" ? (
    t("ia.subtitle")
  ) : meta?.type === "official" ? (
    <span className="inline-flex items-center gap-1"><Icon name="badge-check" size={14} />{t("conversations.official")}</span>
  ) : meta?.peer ? (
    effectivePresence === "online" ? (
      <span className="text-[var(--ok)] font-semibold">{t("conversations.online")}</span>
    ) : peerLastSeen ? (
      t("profile.lastSeen", { when: fmtLastSeen(peerLastSeen, now) })
    ) : (
      meta.peer.status_emoji ? `${meta.peer.status_emoji} ${meta.peer.status_text}` : meta.peer.status_text || `@${meta.peer.username}`
    )
  ) : (
    `${meta?.members_count ?? 0} participantes`
  );

  const composerDisabled = isReadOnly || peerBlocked;
  const composerReason = isReadOnly
    ? meta?.type === "channel"
      ? t("communities.announceOnly")
      : t("chat.readOnly")
    : peerBlocked
      ? t("chat.blocked1")
      : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface tablet:rounded-3xl tablet:m-3 tablet:ml-0 overflow-hidden relative">
      {/* papel de parede */}
      <div className="absolute inset-0 chat-wallpaper" style={wallpaperStyle(wallpaper.value, 0, 0)} aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none" style={wallpaperOverlay(wallpaper.blur, wallpaper.dim)} aria-hidden="true" />

      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* cabeçalho */}
        <header className="shrink-0 glass border-b border-line">
          <div className="flex items-center gap-1 px-2 tablet:px-4 h-[72px]">
            {onBack && (
              <span className="tablet:hidden">
                <IconButton label={t("a11y.back")} onClick={onBack}><Icon name="back" size={22} /></IconButton>
              </span>
            )}
            <button
              className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-2xl px-1 py-1"
              onClick={() => {
                if (meta?.peer) router.push(`/perfil/${meta.peer.username}`);
                else if (meta?.type === "group") setInfoOpen(true);
              }}
              aria-label={meta?.peer ? `${meta.title} — ${t("chat.viewProfile")}` : meta?.type === "group" ? `${meta?.title} — ${t("groups.info")}` : meta?.title}
            >
              {meta?.type === "official" ? (
                <ElioMark size={44} />
              ) : meta?.type === "ai" ? (
                <span className="w-11 h-11 rounded-full shrink-0 inline-flex items-center justify-center text-white bg-gradient-to-br from-[var(--brand-deep)] to-[var(--accent)]">
                  <Icon name="sparkles" size={22} />
                </span>
              ) : meta?.peer ? (
                <AvatarWithPresence src={meta.peer.avatar_url} name={meta.peer.display_name} presence={effectivePresence} />
              ) : (
                <AvatarWithPresence src={meta?.avatar_url} name={meta?.title ?? "?"} />
              )}
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 font-display font-extrabold text-[17px] truncate">
                  <span className="truncate">{meta?.type === "channel" ? `#${meta?.title}` : meta?.title}</span>
                  {convMuted && <Icon name="bell-off" size={15} className="text-muted shrink-0" />}
                  {(meta?.disappear_after ?? 0) > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-soft text-brand shrink-0">
                      {meta?.disappear_after === 604800 ? t("disappear.badge7") : t("disappear.badge24")}
                    </span>
                  )}
                </span>
                <span className="block text-[13px] text-muted truncate">{subtitle}</span>
              </span>
            </button>
            {(meta?.type === "direct" || meta?.type === "group" || meta?.type === "channel") && (
              <>
                <IconButton
                  label={t("chat.callVoice")}
                  onClick={() => {
                    if (meta?.type === "direct" && meta.peer) {
                      call.start(conversationId, "voice", {
                        id: meta.peer.id,
                        username: meta.peer.username,
                        display_name: meta.peer.display_name,
                        avatar_url: meta.peer.avatar_url,
                      });
                    } else {
                      toast(t("calls.oneToOneOnly"), "info");
                    }
                  }}
                >
                  <Icon name="phone" size={21} />
                </IconButton>
                <IconButton
                  label={t("chat.callVideo")}
                  onClick={() => {
                    if (meta?.type === "direct" && meta.peer) {
                      call.start(conversationId, "video", {
                        id: meta.peer.id,
                        username: meta.peer.username,
                        display_name: meta.peer.display_name,
                        avatar_url: meta.peer.avatar_url,
                      });
                    } else {
                      toast(t("calls.oneToOneOnly"), "info");
                    }
                  }}
                >
                  <Icon name="video" size={22} />
                </IconButton>
              </>
            )}
            <Dropdown
              trigger={
                <span className="inline-flex">
                  <IconButton label={t("chat.menu")} onClick={() => {}}>
                    <Icon name="dots" size={21} />
                  </IconButton>
                </span>
              }
              items={menuItems}
            />
          </div>
          {searchOpen && meta && (
            <MessageSearch
              conversationId={conversationId}
              onJump={(id) => apiRef.current?.jumpTo(id)}
              onClose={() => setSearchOpen(false)}
            />
          )}
        </header>

        {/* fixadas */}
        {meta && (
          <PinnedBar
            conversationId={conversationId}
            tick={conv.pinsTick}
            onJump={(id) => apiRef.current?.jumpTo(id)}
          />
        )}

        {/* mensagens */}
        {conv.messages.length === 0 && !conv.loading ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-6">
            <div className="glass border border-line rounded-3xl px-8 py-6 text-center shadow-soft">
              <p className="font-display font-extrabold text-lg">Diga oi! 👋</p>
              <p className="text-sm text-muted mt-1">As mensagens aparecem aqui em tempo real.</p>
            </div>
          </div>
        ) : (
          <MessageList
            messages={conv.messages}
            meta={meta}
            myId={user.id}
            readOn={readOn}
            loadingMore={conv.loadingMore}
            hasMore={conv.hasMore}
            onLoadMore={conv.loadMore}
            onReply={(m) => setReplyTo(m)}
            onDelete={(m, scope) => void conv.removeMessage(m.id, scope)}
            onReact={(m, emoji) => void reactTo(m, emoji)}
            onEdit={(m, body) => editMessage(m, body)}
            onForward={(m) => setForwardId(m.id)}
            onPin={(m, pinned) => void pinMessage(m, pinned)}
            apiRef={apiRef}
          />
        )}

        {/* entrada */}
        <div className="glass border-t border-line">
          <Composer
            conversationId={conversationId}
            disabled={composerDisabled}
            disabledReason={composerReason}
            noMedia={meta?.type === "ai"}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSend={async (body, replyId) => {
              if (meta?.type === "ai") await conv.sendAi(body);
              else await conv.send(body, replyId);
              apiRef.current?.scrollToBottom(false);
            }}
            onMediaSent={async () => {
              await conv.syncLatest();
              apiRef.current?.scrollToBottom(false);
            }}
            sending={conv.sending}
            typingEnabled={settings?.typing_indicators ?? true}
          />
        </div>
      </div>

      {/* silenciar conversa */}
      <Modal open={muteOpen} onClose={() => setMuteOpen(false)} title={t("conversations.mute")}>
        <div className="flex flex-col gap-2">
          {MUTE_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                const until = o.ms === null ? null : new Date(Date.now() + o.ms).toISOString();
                setMuteOpen(false);
                void patchConv({ muted_until: until }, t("contacts.muted"));
              }}
              className="flex items-center gap-3 px-4 min-h-[52px] rounded-2xl bg-surface2 hover:bg-[var(--line)] font-medium text-left"
            >
              <Icon name="bell-off" size={18} className="text-muted" />
              {o.key === "forever" ? "Para sempre" : o.label}
            </button>
          ))}
        </div>
      </Modal>

      {/* timer de sumiço */}
      <Modal open={timerOpen} onClose={() => setTimerOpen(false)} title={t("disappear.title")}>
        <p className="text-sm text-muted mb-3">{t("disappear.desc")}</p>
        <div className="flex flex-col gap-2">
          {TIMER_OPTIONS.map((o) => {
            const active = (meta?.disappear_after ?? 0) === o.seconds;
            return (
              <button
                key={o.seconds}
                disabled={timerBusy}
                onClick={() => void setTimer(o.seconds)}
                className={cn(
                  "flex items-center gap-3 px-4 min-h-[52px] rounded-2xl font-medium text-left",
                  "disabled:opacity-50",
                  active ? "bg-brand-soft text-brand" : "bg-surface2 hover:bg-[var(--line)]",
                )}
              >
                <Icon name="clock" size={18} className={active ? "text-brand" : "text-muted"} />
                <span className="flex-1">{t(o.labelKey)}</span>
                {active && <Icon name="check" size={18} />}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-muted mt-3">{t("disappear.note")}</p>
      </Modal>

      {/* papel de parede desta conversa */}
      {wallOpen && (
        <WallpaperModal
          scope="conversation"
          conversationId={conversationId}
          onClose={() => {
            setWallOpen(false);
            void conv.loadMeta();
          }}
        />
      )}

      {/* dados do grupo */}
      {meta?.type === "group" && (
        <GroupInfo
          conversationId={conversationId}
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          onChanged={() => void conv.loadMeta()}
          onLeft={() => router.push("/conversas")}
          myId={user.id}
        />
      )}

      {/* encaminhar */}
      <ForwardModal
        messageId={forwardId}
        onClose={() => setForwardId(null)}
        onDone={(id) => router.push(`/conversas/${id}`)}
      />
    </div>
  );
}
