"use client";

/**
 * Lista de conversas: busca, fixadas, não lidas, arquivadas + ações.
 */
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AvatarWithPresence, CountBadge, Dropdown, EmptyState, ErrorState, Icon,
  IconButton, SearchInput, Skeleton, type MenuItem,
} from "@/components/ui";
import { ElioMark } from "@/components/brand";
import { useApp, useToast } from "@/components/providers";
import { useInbox } from "@/components/layout/AppShell";
import { NewConversationModal } from "@/components/layout/NewConversationModal";
import { fmtListTime, friendlyError } from "@/lib/utils";
import { useNow } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ConversationItem } from "@/lib/supabase/types";

function previewText(c: ConversationItem): string {
  const last = c.last_message;
  if (!last) return "";
  if (last.sender_id === null) return last.body;
  const body = last.type === "text" || !last.type
    ? last.body
    : (() => {
        const label =
          last.type === "image" ? t("media.photoLabel")
          : last.type === "video" ? t("media.videoLabel")
          : last.type === "audio" ? t("media.audioLabel")
          : t("media.fileLabel");
        return last.body ? `${label} · ${last.body}` : label;
      })();
  if (c.type === "direct" || c.type === "official") {
    return last.sender_name === "Você" ? `Você: ${body}` : body;
  }
  return `${last.sender_name}: ${body}`;
}

function ConvAvatar({ c }: { c: ConversationItem }) {
  if (c.type === "official") return <ElioMark size={48} />;
  if (c.type === "ai") {
    return (
      <span className="w-12 h-12 rounded-full shrink-0 inline-flex items-center justify-center text-white bg-gradient-to-br from-[var(--brand-deep)] to-[var(--accent)]">
        <Icon name="sparkles" size={22} />
      </span>
    );
  }
  if (c.peer) {
    return (
      <AvatarWithPresence
        src={c.peer.avatar_url} name={c.peer.display_name}
        presence={c.peer.presence === "invisible" ? null : c.peer.presence}
      />
    );
  }
  return <AvatarWithPresence src={c.avatar_url} name={c.title || "?"} />;
}

export function ConversationList({ selectedId }: { selectedId?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { presenceMap } = useApp();
  const { items, loading, error, refresh, patch } = useInbox();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const now = useNow();

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = items.map((c) =>
      c.peer && presenceMap[c.peer.id] ? { ...c, peer: { ...c.peer, ...presenceMap[c.peer.id] } } : c,
    );
    if (!term) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(term) ||
        (c.peer?.username ?? "").toLowerCase().includes(term) ||
        previewText(c).toLowerCase().includes(term),
    );
  }, [items, q, presenceMap]);

  const visible = filtered.filter((c) => (showArchived ? !!c.archived_at : !c.archived_at));
  const archivedCount = filtered.filter((c) => !!c.archived_at).length;

  const openConv = (id: string) => router.push(`/conversas/${id}`);

  async function openAi() {
    try {
      const res = await fetch("/api/ia/chat");
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(json.error);
      if (json.id) openConv(json.id);
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  }

  const itemMenu = (c: ConversationItem): MenuItem[] => [
    c.pinned_at
      ? { label: t("conversations.unpin"), icon: "pin", onSelect: () => void patch(c.id, { pinned: false }) }
      : { label: t("conversations.pin"), icon: "pin", onSelect: () => void patch(c.id, { pinned: true }) },
    c.archived_at
      ? { label: t("conversations.unarchive"), icon: "archive", onSelect: () => void patch(c.id, { archived: false }) }
      : { label: t("conversations.archive"), icon: "archive", onSelect: () => void patch(c.id, { archived: true }) },
    { label: t("conversations.markUnread"), icon: "chat", onSelect: () => void patch(c.id, { mark_unread: true }) },
    c.muted_until
      ? { label: t("conversations.unmute"), icon: "bell", onSelect: () => void patch(c.id, { muted_until: null }) }
      : { label: t("conversations.mute"), icon: "bell-off", onSelect: () => void patch(c.id, { muted_until: null }).then(() => openConv(c.id)) },
    {
      label: t("conversations.delete"), icon: "trash", danger: true,
      onSelect: async () => {
        if (!window.confirm(t("conversations.deleteConfirmD"))) return;
        try {
          const res = await fetch(`/api/conversations/${c.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
          await refresh();
        } catch (e) {
          toast(e instanceof Error ? e.message : t("errors.generic"), "error");
        }
      },
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface tablet:bg-transparent">
      <div className="shrink-0 px-4 pt-4 tablet:pt-5 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display font-extrabold text-[22px]">{t("conversations.title")}</h1>
          <IconButton label={t("conversations.new")} onClick={() => setNewOpen(true)} className="bg-brand-soft text-brand hover:bg-[var(--brand)] hover:text-white w-10 h-10 rounded-xl">
            <Icon name="plus" size={20} />
          </IconButton>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder={t("conversations.search")} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4" role="list" aria-label={t("conversations.title")}>
        {loading && (
          <div className="flex flex-col gap-1 px-2" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1"><Skeleton className="h-4 w-2/3 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && <ErrorState message={error} onRetry={() => void refresh()} />}

        {!loading && !error && (
          <>
            {/* Elio IA fixa no topo (Fase 5) */}
            <div className="px-2">
              <button
                onClick={() => void openAi()}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-surface2 text-left transition-colors"
              >
                <span className="w-12 h-12 rounded-full shrink-0 inline-flex items-center justify-center text-white bg-gradient-to-br from-[var(--brand-deep)] to-[var(--accent)]">
                  <Icon name="sparkles" size={22} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 font-bold text-[15px]">
                    Elio IA
                  </span>
                  <span className="block text-[13px] text-muted truncate">{t("ia.subtitle")}</span>
                </span>
              </button>
            </div>

            {visible.length === 0 && (
              <EmptyState
                icon="chat" title={t("conversations.empty")} description={t("conversations.emptyDesc")}
                action={<button onClick={() => setNewOpen(true)} className="h-11 px-5 rounded-2xl bg-gradient-to-r from-[var(--brand-deep)] to-[var(--brand)] text-white text-sm font-semibold">{t("conversations.new")}</button>}
              />
            )}

            {visible.map((c) => {
              const unread = c.unread_count ?? 0;
              const muted = !!c.muted_until && new Date(c.muted_until).getTime() > Date.now();
              const isActive = selectedId === c.id;
              return (
                <div key={c.id} role="listitem" className={cn("cv-row relative group rounded-2xl", isActive && "bg-brand-soft/70")}>
                  <button
                    onClick={() => openConv(c.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-surface2 text-left transition-colors"
                    aria-label={`${c.title}${unread > 0 ? `, ${unread} não lidas` : ""}`}
                  >
                    <ConvAvatar c={c} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-bold text-[15px] truncate">
                          <span className="truncate">{c.type === "channel" ? `#${c.title}` : c.title}</span>
                          {c.type === "official" && <Icon name="badge-check" size={15} className="text-brand shrink-0" />}
                          {c.type === "channel" && c.is_announcement && <Icon name="bell" size={13} className="text-brand shrink-0" />}
                          {c.pinned_at && <Icon name="pin" size={13} className="text-muted shrink-0" />}
                          {muted && <Icon name="bell-off" size={13} className="text-muted shrink-0" />}
                        </span>
                        <span className={cn("text-xs shrink-0", unread > 0 ? "text-accent font-bold" : "text-muted")}>
                          {fmtListTime(c.last_message_at, now)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2 mt-0.5">
                        <span className={cn("text-[13px] truncate", unread > 0 ? "text-ink font-medium" : "text-muted")}>
                          {previewText(c)}
                        </span>
                        <CountBadge count={unread} className="shrink-0" />
                      </span>
                    </span>
                  </button>
                  <span className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity hidden tablet:block">
                    <Dropdown
                      trigger={
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface shadow-soft text-muted cursor-pointer" role="button" aria-label={t("chat.menu")} tabIndex={0}>
                          <Icon name="dots" size={16} />
                        </span>
                      }
                      items={itemMenu(c)}
                    />
                  </span>
                </div>
              );
            })}

            {archivedCount > 0 && (
              <div className="px-2 mt-1">
                <button
                  onClick={() => setShowArchived((s) => !s)}
                  className="w-full flex items-center gap-2 px-3 min-h-[44px] rounded-2xl text-sm font-semibold text-muted hover:bg-surface2"
                >
                  <Icon name="archive" size={17} />
                  {showArchived ? t("conversations.hideArchived") : `${t("conversations.showArchived")} (${archivedCount})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <NewConversationModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
