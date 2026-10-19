"use client";

/**
 * Comunidades: minhas comunidades + criar + entrar com convite.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar, Button, EmptyState, ErrorState, Field, Icon, IconButton,
  Input, Modal, SearchInput, Skeleton, Textarea,
} from "@/components/ui";
import { useToast } from "@/components/providers";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { CommunityItem, CommunityRole } from "@/lib/supabase/types";

const ROLE_LABEL: Record<CommunityRole, string> = {
  owner: t("communities.owner"),
  admin: t("communities.admin"),
  moderator: t("communities.moderator"),
  member: t("communities.member"),
};

export function CommunitiesView() {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/communities");
      const json = (await res.json()) as { communities?: CommunityItem[]; error?: string };
      if (!res.ok) throw new Error(json.error);
      setItems(json.communities ?? []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((c) => c.name.toLowerCase().includes(term));
  }, [items, q]);

  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.created"), "ok");
      setCreateOpen(false);
      setName("");
      setDesc("");
      if (json.id) router.push(`/comunidades/${json.id}`);
      else await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (busy || !code.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.joined"), "ok");
      setJoinOpen(false);
      setCode("");
      if (json.id) router.push(`/comunidades/${json.id}`);
      else await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 tablet:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="font-display font-extrabold text-2xl flex-1">{t("communities.title")}</h1>
          <IconButton label={t("communities.joinTitle")} onClick={() => setJoinOpen(true)} className="bg-surface2">
            <Icon name="link" size={19} />
          </IconButton>
          <Button size="sm" icon="plus" onClick={() => setCreateOpen(true)}>
            {t("communities.new")}
          </Button>
        </div>

        <SearchInput value={q} onChange={setQ} placeholder={t("explore.searchPh")} />

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 bg-surface rounded-2xl p-4">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="users"
            title={t("communities.empty")}
            description={t("communities.emptyDesc")}
            action={
              <Button icon="plus" onClick={() => setCreateOpen(true)}>
                {t("communities.new")}
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => router.push(`/comunidades/${c.id}`)}
                  className="w-full text-left flex items-center gap-3 bg-surface rounded-2xl p-4 hover:bg-surface2 transition-colors"
                >
                  <Avatar src={c.avatar_url} name={c.name} size="lg" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-bold truncate">{c.name}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-soft text-brand shrink-0">
                        {ROLE_LABEL[c.my_role]}
                      </span>
                    </span>
                    <span className="block text-sm text-muted truncate">
                      {t("communities.members", { n: c.members_count })}
                      {" · "}
                      {c.channels.slice(0, 3).map((ch) => `#${ch.title}`).join("  ")}
                      {c.channels.length > 3 ? "  …" : ""}
                    </span>
                  </span>
                  <Icon name="chev-right" size={18} className="text-muted shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("communities.newTitle")}>
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("communities.newDesc")}</p>
            <Field label={t("communities.nameLabel")} htmlFor="c-name">
              <Input
                id="c-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t("communities.namePh")} maxLength={60} autoFocus
              />
            </Field>
            <Field label={t("groups.description")} htmlFor="c-desc">
              <Textarea
                id="c-desc" value={desc} onChange={(e) => setDesc(e.target.value)}
                placeholder={t("communities.descPh")} maxLength={300} rows={3}
              />
            </Field>
            <Button full loading={busy} disabled={!name.trim()} icon="plus" onClick={() => void create()}>
              {t("communities.create")}
            </Button>
          </div>
        </Modal>

        <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title={t("communities.joinTitle")}>
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("communities.joinDesc")}</p>
            <Field label={t("groups.codePh")} htmlFor="c-code">
              <Input
                id="c-code" value={code} onChange={(e) => setCode(e.target.value)}
                placeholder={t("groups.codePh")} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void join(); }}
              />
            </Field>
            <Button full loading={busy} disabled={!code.trim()} icon="link" onClick={() => void join()}>
              {t("communities.join")}
            </Button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
