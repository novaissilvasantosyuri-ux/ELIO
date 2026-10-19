"use client";

/**
 * Cartão de perfil de outra pessoa: foto, nome, @, bio e ações.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar, Button, ConfirmDialog, EmptyState, ErrorState, Icon, Modal, Skeleton,
} from "@/components/ui";
import { useApp, useToast } from "@/components/providers";
import { storageUrl } from "@/lib/images";
import { fmtLastSeen, friendlyError } from "@/lib/utils";
import { useNow } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import type { Profile } from "@/lib/supabase/types";

interface CardData {
  profile: Profile;
  is_contact: boolean;
  blocked_by_me: boolean;
  muted_by_me: boolean;
  is_self: boolean;
}

const MUTE_OPTIONS = [
  { key: "1h", label: "1 hora", ms: 3600_000 },
  { key: "8h", label: "8 horas", ms: 8 * 3600_000 },
  { key: "1w", label: "1 semana", ms: 7 * 24 * 3600_000 },
  { key: "forever", label: "Para sempre", ms: null as number | null },
];

export function UserCard({ username }: { username: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { setBlocksLocal, blocks, setMutesLocal, mutes, presenceMap } = useApp();
  const [data, setData] = useState<CardData | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muteOpen, setMuteOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`);
      const json = (await res.json()) as { profile?: Profile | null; error?: string } & Omit<CardData, "profile">;
      if (!res.ok) throw new Error(json.error);
      if (!json.profile) {
        setMissing(true);
        return;
      }
      setData(json as CardData);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto w-full px-4 py-5">
        <Skeleton className="h-32 rounded-3xl mb-4" />
        <div className="flex gap-4 items-center">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="flex-1"><Skeleton className="h-5 w-40 mb-2" /><Skeleton className="h-4 w-24" /></div>
        </div>
      </div>
    );
  }
  if (error) {
    return <div className="max-w-xl mx-auto px-4 py-10"><ErrorState message={error} onRetry={() => void load()} /></div>;
  }
  if (missing || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <EmptyState icon="user" title={t("errors.notFound")} description="Este perfil não existe ou está privado." />
      </div>
    );
  }

  const p = data.profile;
  if (data.is_self) {
    router.replace("/perfil");
    return null;
  }
  const live = presenceMap[p.id];
  const presence = live?.presence ?? p.presence;
  const lastSeen = live?.last_seen_at ?? p.last_seen_at;
  const showPresence = presence !== "invisible";
  const blocked = data.blocked_by_me || blocks.has(p.id);
  const muted = data.muted_by_me || mutes.has(p.id);

  const bannerStyle = p.banner_url
    ? p.banner_url.startsWith("#")
      ? { background: p.banner_url }
      : { backgroundImage: `url("${storageUrl("banners", p.banner_url)}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(135deg, var(--brand-deep), var(--accent))" };

  const startChat = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: p.username }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error);
      router.push(`/conversas/${json.id}`);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    setBlockOpen(false);
    try {
      const res = await fetch("/api/blocks", {
        method: blocked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: p.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      const next = new Set(blocks);
      if (blocked) next.delete(p.id);
      else next.add(p.id);
      setBlocksLocal(next);
      setData({ ...data, blocked_by_me: !blocked });
      toast(blocked ? "Desbloqueado." : "Bloqueado. A pessoa não foi avisada.", "ok");
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  const setMute = async (until: string | null | "off") => {
    setMuteOpen(false);
    try {
      if (until === "off") {
        const res = await fetch("/api/mutes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: p.id }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        const next = new Map(mutes);
        next.delete(p.id);
        setMutesLocal(next);
        setData({ ...data, muted_by_me: false });
        toast("Som reativado.", "ok");
      } else {
        const res = await fetch("/api/mutes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: p.id, until }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        const next = new Map(mutes);
        next.set(p.id, until);
        setMutesLocal(next);
        setData({ ...data, muted_by_me: true });
        toast(t("contacts.muted"), "ok");
      }
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  return (
    <div className="max-w-xl mx-auto w-full px-4 tablet:px-6 py-5 pb-28 tablet:pb-10">
      <div className="rounded-3xl overflow-hidden border border-line bg-surface shadow-soft">
        <div className="h-28 tablet:h-36" style={bannerStyle} />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end justify-between gap-3">
            <span className="rounded-full border-4 border-surface inline-block">
              <Avatar src={storageUrl("avatars", p.avatar_url)} name={p.display_name} size="xl" />
            </span>
            {showPresence && (
              <span className="mb-1 inline-flex items-center gap-1.5 text-[13px] text-muted bg-surface2 px-3 py-1.5 rounded-full">
                <span className={`w-2.5 h-2.5 rounded-full ${presence === "online" ? "bg-online" : presence === "away" ? "bg-away" : presence === "busy" ? "bg-busy" : "bg-[var(--line)]"}`} />
                {presence === "online" ? t("presence.online") : lastSeen ? t("profile.lastSeen", { when: fmtLastSeen(lastSeen, now) }) : t(`presence.${presence}`)}
              </span>
            )}
          </div>
          <p className="font-display font-extrabold text-xl mt-3">{p.display_name}</p>
          <p className="text-sm text-muted">@{p.username}</p>
          {p.bio && <p className="text-[15px] mt-2 leading-relaxed">{p.bio}</p>}
          {(p.status_emoji || p.status_text) && (
            <p className="text-sm mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface2">
              {p.status_emoji} {p.status_text}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <Button icon="chat" onClick={() => void startChat()} loading={busy}>{t("profile.message")}</Button>
            <Button variant="secondary" icon="phone" onClick={() => toast(t("chat.callSoon"), "info")}>{t("profile.call")}</Button>
            <Button variant="secondary" icon={muted ? "bell" : "bell-off"} onClick={() => (muted ? void setMute("off") : setMuteOpen(true))}>
              {muted ? t("profile.unmute") : t("profile.mute")}
            </Button>
            <Button variant="secondary" icon="block" onClick={() => (blocked ? void toggleBlock() : setBlockOpen(true))}>
              <span className={blocked ? "" : "text-danger"}>{blocked ? t("profile.unblock") : t("profile.block")}</span>
            </Button>
          </div>
          <button
            onClick={() => toast("Denúncias chegam na Fase 4, com as comunidades. 🚩", "info")}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 min-h-[44px] text-sm font-semibold text-muted hover:text-danger"
          >
            <Icon name="flag" size={16} /> {t("profile.report")}
          </button>
        </div>
      </div>

      <Modal open={muteOpen} onClose={() => setMuteOpen(false)} title={t("profile.mute")}>
        <div className="flex flex-col gap-2">
          {MUTE_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => void setMute(o.ms === null ? null : new Date(Date.now() + o.ms).toISOString())}
              className="flex items-center gap-3 px-4 min-h-[52px] rounded-2xl bg-surface2 hover:bg-[var(--line)] font-medium text-left"
            >
              <Icon name="bell-off" size={18} className="text-muted" />
              {o.key === "forever" ? "Para sempre" : o.label}
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={() => void toggleBlock()}
        title={t("contacts.blockConfirmT", { name: p.display_name })}
        description={t("contacts.blockConfirmD")}
        confirmLabel={t("contacts.block")}
        danger
      />
    </div>
  );
}
