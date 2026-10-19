"use client";

/**
 * Peças das mensagens (Fase 2B): anexo, reações, encaminhar, fixadas, lightbox.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Avatar, Button, EmptyState, Icon, Modal, SearchInput, Spinner,
} from "@/components/ui";
import { useToast } from "@/components/providers";
import { cn, friendlyError } from "@/lib/utils";
import { fmtDuration, fmtSize } from "@/lib/media";
import { t } from "@/lib/i18n";
import type {
  Attachment, ConversationItem, PinnedMessage, ReactionCount,
} from "@/lib/supabase/types";

/* ================= ANEXO ================= */

export function AttachmentView({
  att, mine, onOpenImage,
}: {
  att: Attachment;
  mine: boolean;
  onOpenImage: (url: string, name: string) => void;
}) {
  const url = `/api/attachments/${att.id}`;
  const ratio = att.width && att.height ? `${att.width} / ${att.height}` : undefined;

  if (att.mime.startsWith("image/")) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpenImage(url, att.filename || "foto"); }}
        className="block w-full overflow-hidden rounded-xl -mx-1 -mt-1 mb-1 cursor-zoom-in"
        aria-label={t("media.viewImage")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={att.filename || ""}
          loading="lazy"
          draggable={false}
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="w-full max-h-80 object-cover bg-black/10"
        />
      </button>
    );
  }

  if (att.mime.startsWith("video/")) {
    return (
      <span className="block -mx-1 -mt-1 mb-1 overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
        <video src={url} controls preload="metadata" className="w-full max-h-80 bg-black/80" />
      </span>
    );
  }

  if (att.mime.startsWith("audio/")) {
    return (
      <span className="block min-w-52 mb-1" onClick={(e) => e.stopPropagation()}>
        <audio src={url} controls preload="metadata" className="w-full h-10" />
        {att.duration_s ? (
          <span className={cn("block text-[11px] mt-0.5", mine ? "text-white/85" : "text-muted")}>
            🎙️ {fmtDuration(att.duration_s)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <a
      href={url}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1 min-w-48",
        mine ? "bg-black/15 hover:bg-black/25" : "bg-surface2 hover:bg-[var(--line)]",
      )}
    >
      <Icon name="download" size={20} className="shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold truncate">{att.filename || t("media.fileLabel")}</span>
        <span className={cn("block text-[11px]", mine ? "text-white/85" : "text-muted")}>{fmtSize(att.size_bytes)}</span>
      </span>
    </a>
  );
}

/* ================= REAÇÕES ================= */

const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏", "👏", "🔥", "🎉", "💯", "😍", "🤔"];

export function ReactionsRow({
  reactions, mine, onToggle, onMore,
}: {
  reactions: ReactionCount[];
  mine: boolean;
  onToggle: (emoji: string) => void;
  onMore: () => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1 mt-1", mine && "justify-end")}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={(e) => { e.stopPropagation(); onToggle(r.emoji); }}
          aria-label={`${r.emoji} × ${r.count}`}
          className={cn(
            "inline-flex items-center gap-1 h-7 px-2 rounded-full text-sm border shadow-sm transition-transform active:scale-95",
            r.mine
              ? "bg-brand-soft border-[var(--brand)]"
              : "bg-surface border-line hover:border-[var(--brand)]",
          )}
        >
          <span aria-hidden="true">{r.emoji}</span>
          {r.count > 1 && <span className="text-[11px] font-bold text-muted">{r.count}</span>}
        </button>
      ))}
      <button
        onClick={(e) => { e.stopPropagation(); onMore(); }}
        aria-label={t("chat.react")}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface border border-line text-muted text-sm shadow-sm hover:text-ink"
      >
        +
      </button>
    </span>
  );
}

export function ReactionPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={t("chat.reactTitle")}>
      <div className="grid grid-cols-6 gap-1">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="h-12 text-3xl rounded-2xl hover:bg-surface2 active:scale-90 transition-transform"
            aria-label={e}
          >
            {e}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ================= ENCAMINHAR ================= */

export function ForwardModal({
  messageId, onClose, onDone,
}: {
  /** null = fechado; string = id da mensagem a encaminhar. */
  messageId: string | null;
  onClose: () => void;
  onDone: (conversationId: string) => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const open = messageId !== null;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/conversations")
      .then(async (res) => {
        const json = (await res.json()) as { conversations?: ConversationItem[]; error?: string };
        if (!res.ok) throw new Error(json.error);
        setItems((json.conversations ?? []).filter((c) => c.type !== "official" && c.type !== "system"));
      })
      .catch((e) => toast(friendlyError(e), "error"))
      .finally(() => setLoading(false));
  }, [open, toast]);

  const term = q.trim().toLowerCase();
  const visible = term ? items.filter((c) => c.title.toLowerCase().includes(term)) : items;

  return (
    <Modal open={open} onClose={onClose} title={t("chat.forwardTitle")}>
      <SearchInput value={q} onChange={setQ} placeholder={t("conversations.search")} />
      <div className="mt-3 flex flex-col gap-1 max-h-72 overflow-y-auto">
        {loading && <div className="flex justify-center py-8 text-muted"><Spinner /></div>}
        {!loading && visible.length === 0 && <EmptyState icon="search" title={t("conversations.noResults")} />}
        {!loading && visible.map((c) => (
          <button
            key={c.id}
            disabled={sendingId !== null}
            onClick={() => {
              if (typeof messageId !== "string") return;
              setSendingId(c.id);
              fetch(`/api/messages/${messageId}/forward`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversation_id: c.id }),
              })
                .then(async (res) => {
                  const json = (await res.json().catch(() => ({}))) as { error?: string };
                  if (!res.ok) throw new Error(json.error);
                  toast(t("chat.forwardedOk"), "ok");
                  onClose();
                  onDone(c.id);
                })
                .catch((e) => toast(friendlyError(e), "error"))
                .finally(() => setSendingId(null));
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2 text-left disabled:opacity-60"
          >
            <Avatar src={c.peer ? c.peer.avatar_url : c.avatar_url} name={c.peer ? c.peer.display_name : c.title} size="sm" />
            <span className="flex-1 min-w-0 font-bold truncate text-[15px]">{c.title}</span>
            {sendingId === c.id ? <Spinner size={18} /> : <Icon name="send" size={17} className="text-muted" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ================= FIXADAS ================= */

export function PinnedBar({
  conversationId, tick, onJump,
}: {
  conversationId: string;
  tick: number;
  onJump: (id: string) => void;
}) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [ix, setIx] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/pinned`);
      const json = (await res.json()) as { pinned?: PinnedMessage[] };
      if (!res.ok) return;
      setPins(json.pinned ?? []);
      setIx(0);
    } catch {
      /* some na próxima */
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  if (pins.length === 0) return null;
  const current = pins[ix % pins.length]!;
  const label = current.type === "text"
    ? current.body || "…"
    : current.type === "image" ? t("media.photoLabel")
      : current.type === "video" ? t("media.videoLabel")
        : current.type === "audio" ? t("media.audioLabel")
          : t("media.fileLabel");

  return (
    <div className="shrink-0 px-3 tablet:px-5 pt-2">
      <div className="flex items-center gap-2 rounded-2xl bg-surface2/90 border border-line pl-3 pr-1.5 py-1.5 shadow-sm">
        <Icon name="pin" size={16} className="text-brand shrink-0" />
        <button onClick={() => onJump(current.id)} className="flex-1 min-w-0 text-left">
          <span className="block text-[11px] font-bold text-brand truncate">{current.sender_name}</span>
          <span className="block text-[13px] text-muted truncate">{label}</span>
        </button>
        {pins.length > 1 && (
          <span className="inline-flex items-center gap-0.5 shrink-0">
            <button
              aria-label="‹"
              onClick={() => setIx((v) => (v + pins.length - 1) % pins.length)}
              className="w-8 h-8 rounded-lg text-muted hover:bg-surface font-bold"
            >
              ‹
            </button>
            <span className="text-[11px] font-bold text-muted min-w-8 text-center">{(ix % pins.length) + 1}/{pins.length}</span>
            <button
              aria-label="›"
              onClick={() => setIx((v) => (v + 1) % pins.length)}
              className="w-8 h-8 rounded-lg text-muted hover:bg-surface font-bold"
            >
              ›
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ================= LIGHTBOX ================= */

export function Lightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex items-center justify-between px-4 h-16 text-white shrink-0">
        <span className="font-bold truncate">{name}</span>
        <span className="inline-flex gap-1">
          <a
            href={url}
            download={name}
            aria-label={t("media.download")}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/15"
          >
            <Icon name="download" size={21} />
          </a>
          <button
            onClick={onClose}
            aria-label={t("a11y.close")}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/15"
          >
            <Icon name="x" size={22} />
          </button>
        </span>
      </div>
      <button onClick={onClose} className="flex-1 min-h-0 flex items-center justify-center p-4 cursor-zoom-out" aria-label={t("a11y.close")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} draggable={false} className="max-w-full max-h-full object-contain rounded-lg" />
      </button>
    </div>
  );
}
