"use client";

/** Busca dentro da conversa (servidor; respeita privacidade via RLS). */
import React, { useEffect, useState } from "react";
import { EmptyState, Icon, IconButton, SearchInput, Spinner } from "@/components/ui";
import { useDebouncedCallback } from "@/lib/hooks";
import { fmtHour, fmtListTime } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { MessageItem } from "@/lib/supabase/types";

export function MessageSearch({
  conversationId, onJump, onClose,
}: { conversationId: string; onJump: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = useDebouncedCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/messages/search?conversation_id=${conversationId}&q=${encodeURIComponent(term.trim())}`,
      );
      const json = (await res.json()) as { messages?: MessageItem[] };
      setResults(json.messages ?? []);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, 350);

  useEffect(() => {
    run(q);
  }, [q, run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="anim-fade-up shrink-0 border-b border-line glass px-3 tablet:px-5 py-2.5 flex flex-col gap-2 max-h-72">
      <div className="flex items-center gap-1.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("chat.searchPh")} className="flex-1" />
        <IconButton label={t("a11y.close")} onClick={onClose} className="w-10 h-10"><Icon name="x" size={18} /></IconButton>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-3 text-muted"><Spinner size={20} /></div>
      )}
      {!loading && searched && results.length === 0 && (
        <p className="text-center text-sm text-muted py-2">{t("chat.searchNoResults")}</p>
      )}
      {!loading && results.length > 0 && (
        <ul className="overflow-y-auto rounded-2xl border border-line bg-surface divide-y divide-[var(--line)]">
          {results.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => {
                  onJump(m.id);
                  onClose();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-surface2"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[var(--brand)]">{m.sender_name}</span>
                  <span className="text-[11px] text-muted shrink-0">
                    {fmtListTime(m.created_at)} · {fmtHour(m.created_at)}
                  </span>
                </span>
                <span className="block text-sm truncate">{m.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && !searched && <EmptyState icon="search" title="" description="" />}
    </div>
  );
}
