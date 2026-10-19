"use client";

/**
 * Explorar: buscar comunidades e entrar.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar, Button, EmptyState, ErrorState, SearchInput, Skeleton,
} from "@/components/ui";
import { useToast } from "@/components/providers";
import { useDebouncedCallback } from "@/lib/hooks";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { ExploreItem } from "@/lib/supabase/types";

export function ExploreView() {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ExploreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/communities/explore?q=${encodeURIComponent(term)}`);
      const json = (await res.json()) as { communities?: ExploreItem[]; error?: string };
      if (!res.ok) throw new Error(json.error);
      setItems(json.communities ?? []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  const debounced = useDebouncedCallback((term: string) => {
    setLoading(true);
    void load(term);
  }, 300);

  async function join(c: ExploreItem) {
    if (busy) return;
    setBusy(c.id);
    try {
      const res = await fetch(`/api/communities/${c.id}/join`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("explore.joined"), "ok");
      router.push(`/comunidades/${c.id}`);
    } catch (e) {
      toast(friendlyError(e), "error");
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 tablet:p-6 space-y-4">
        <h1 className="font-display font-extrabold text-2xl">{t("explore.title")}</h1>
        <SearchInput
          value={q}
          onChange={(v) => { setQ(v); debounced(v); }}
          placeholder={t("explore.searchPh")}
        />

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
          <ErrorState message={error} onRetry={() => { setLoading(true); void load(q); }} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="compass"
            title={t("explore.empty")}
            description={t("explore.emptyDesc")}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-3 bg-surface rounded-2xl p-4">
                <Avatar src={c.avatar_url} name={c.name} size="lg" />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{c.name}</span>
                  <span className="block text-sm text-muted truncate">
                    {c.description || t("communities.noDesc")}
                  </span>
                  <span className="block text-xs text-muted mt-0.5">
                    {t("explore.members", { n: c.members_count })}
                    {" · "}
                    {t("explore.channels", { n: c.channels_count })}
                  </span>
                </span>
                {c.am_member ? (
                  <Button
                    variant="secondary" size="sm"
                    onClick={() => router.push(`/comunidades/${c.id}`)}
                  >
                    {t("explore.member")}
                  </Button>
                ) : (
                  <Button size="sm" loading={busy === c.id} onClick={() => void join(c)}>
                    {t("explore.join")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
