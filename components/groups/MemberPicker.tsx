"use client";

/**
 * Seletor de contatos com busca e múltipla escolha (criar grupo / adicionar).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Avatar, Button, EmptyState, Icon, SearchInput, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";
import { friendlyError, cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { ContactRow } from "@/lib/supabase/types";

export function MemberPicker({
  excludeIds = [],
  confirmLabel,
  onConfirm,
  busy,
}: {
  excludeIds?: string[];
  confirmLabel: string;
  onConfirm: (ids: string[]) => void;
  busy?: boolean;
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/contacts");
        const json = (await res.json()) as { contacts?: ContactRow[]; error?: string };
        if (!res.ok) throw new Error(json.error);
        setContacts(json.contacts ?? []);
      } catch (e) {
        toast(friendlyError(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        !excludeIds.includes(c.user_id) &&
        (!term ||
          c.display_name.toLowerCase().includes(term) ||
          c.username.toLowerCase().includes(term)),
    );
  }, [contacts, excludeIds, q]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8 text-muted">
        <Spinner />
      </div>
    );
  }

  if (contacts.filter((c) => !excludeIds.includes(c.user_id)).length === 0) {
    return <EmptyState icon="users" title={t("groups.noContacts")} />;
  }

  return (
    <div>
      <SearchInput value={q} onChange={setQ} placeholder={t("conversations.search")} />
      <div className="mt-3 flex flex-col gap-1 max-h-64 overflow-y-auto" role="listbox" aria-multiselectable="true">
        {visible.map((c) => {
          const on = picked.has(c.user_id);
          return (
            <button
              key={c.user_id}
              role="option"
              aria-selected={on}
              onClick={() => toggle(c.user_id)}
              className={cn(
                "w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-colors",
                on ? "bg-brand-soft" : "hover:bg-surface2",
              )}
            >
              <Avatar src={c.avatar_url} name={c.display_name} size="sm" />
              <span className="flex-1 min-w-0">
                <span className="block font-bold truncate text-[15px]">{c.display_name}</span>
                <span className="block text-[13px] text-muted truncate">@{c.username}</span>
              </span>
              <span
                className={cn(
                  "w-6 h-6 rounded-full border-2 inline-flex items-center justify-center shrink-0",
                  on ? "bg-brand border-brand text-white" : "border-line text-transparent",
                )}
                aria-hidden="true"
              >
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <EmptyState icon="search" title={t("conversations.noResults")} />
        )}
      </div>
      <div className="mt-4">
        <Button
          full
          loading={busy}
          disabled={picked.size === 0}
          onClick={() => onConfirm([...picked])}
        >
          {confirmLabel}
          {picked.size > 0 ? ` (${picked.size})` : ""}
        </Button>
      </div>
    </div>
  );
}
