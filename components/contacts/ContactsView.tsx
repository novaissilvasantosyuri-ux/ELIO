"use client";

/**
 * Contatos: lista, solicitações (recebidas/enviadas) e bloqueados.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AvatarWithPresence, Button, ConfirmDialog, EmptyState, ErrorState, Icon,
  Modal, SearchInput, Skeleton, Spinner, Tabs,
} from "@/components/ui";
import { useApp, useToast } from "@/components/providers";
import { useDebouncedCallback } from "@/lib/hooks";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { ContactRequest, ContactRow, FoundUser } from "@/lib/supabase/types";

type Tab = "list" | "requests" | "blocked";

export function ContactsView() {
  const router = useRouter();
  const { toast } = useToast();
  const { presenceMap, setBlocksLocal, blocks } = useApp();
  const [tab, setTab] = useState<Tab>("list");
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [received, setReceived] = useState<ContactRequest[]>([]);
  const [sent, setSent] = useState<ContactRequest[]>([]);
  const [blocked, setBlocked] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ContactRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/contacts");
      const json = (await res.json()) as {
        contacts?: ContactRow[]; received?: ContactRequest[]; sent?: ContactRequest[];
        blocked?: ContactRow[]; error?: string;
      };
      if (!res.ok) throw new Error(json.error);
      setContacts(json.contacts ?? []);
      setReceived(json.received ?? []);
      setSent(json.sent ?? []);
      setBlocked(json.blocked ?? []);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withPresence = (list: ContactRow[]) =>
    list.map((c) => {
      const live = presenceMap[c.user_id];
      return live ? { ...c, presence: live.presence, last_seen_at: live.last_seen_at } : c;
    });

  const match = (c: ContactRow) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return c.display_name.toLowerCase().includes(term) || c.username.toLowerCase().includes(term);
  };

  const shown = useMemo(() => {
    if (tab === "list") return withPresence(contacts.filter(match));
    if (tab === "blocked") return blocked.filter(match);
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, contacts, blocked, q, presenceMap]);

  const respond = async (id: string, action: "accept" | "decline" | "cancel") => {
    setBusy(id);
    try {
      const res = await fetch("/api/contacts/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: id, action }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) throw new Error(json.error);
      if (json.status === "accepted") toast(t("contacts.accepted"), "ok");
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const removeContact = async () => {
    if (!removeTarget) return;
    const id = removeTarget.user_id;
    setBusy(id);
    try {
      const res = await fetch("/api/contacts/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const unblock = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      const next = new Set(blocks);
      next.delete(id);
      setBlocksLocal(next);
      await load();
      toast("Desbloqueado.", "ok");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col max-w-2xl mx-auto w-full px-4 tablet:px-6 py-5">
      <div className="flex items-center justify-between mb-3">
        <h1 className="font-display font-extrabold text-[22px]">{t("contacts.title")}</h1>
        <Button size="sm" icon="plus" onClick={() => setAddOpen(true)}>{t("contacts.add")}</Button>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "list", label: t("contacts.tabsList"), count: contacts.length },
          { value: "requests", label: t("contacts.tabsRequests"), count: received.length },
          { value: "blocked", label: t("contacts.tabsBlocked"), count: blocked.length },
        ]}
      />
      {tab !== "requests" && (
        <div className="mt-3"><SearchInput value={q} onChange={setQ} placeholder={t("contacts.search")} /></div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto mt-2 pb-6">
        {loading && (
          <div className="flex flex-col gap-1 mt-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1"><Skeleton className="h-4 w-1/2 mb-2" /><Skeleton className="h-3 w-1/3" /></div>
              </div>
            ))}
          </div>
        )}
        {!loading && error && <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />}

        {!loading && !error && tab !== "requests" && (
          <>
            {shown.length === 0 && (
              <EmptyState
                icon={tab === "blocked" ? "block" : "user"}
                title={tab === "blocked" ? t("contacts.emptyBlocked") : t("contacts.empty")}
                description={tab === "blocked" ? undefined : t("contacts.emptyDesc")}
                action={tab === "blocked" ? undefined : <Button size="sm" onClick={() => setAddOpen(true)}>{t("contacts.addTitle")}</Button>}
              />
            )}
            {shown.map((c) => (
              <div key={c.user_id} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2">
                <button onClick={() => router.push(`/perfil/${c.username}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left" aria-label={`${c.display_name} — ver perfil`}>
                  <AvatarWithPresence
                    src={c.avatar_url} name={c.display_name}
                    presence={tab === "blocked" ? null : c.presence === "invisible" ? null : c.presence}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-[15px] truncate">{c.display_name}</span>
                    <span className="block text-[13px] text-muted truncate">@{c.username}</span>
                  </span>
                </button>
                {tab === "list" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/perfil/${c.username}`)}>{t("contacts.message")}</Button>
                    <button
                      onClick={() => setRemoveTarget(c)}
                      aria-label={t("contacts.remove")}
                      className="p-2.5 rounded-xl text-muted hover:text-danger hover:bg-danger-soft"
                    >
                      <Icon name="x" size={17} />
                    </button>
                  </>
                )}
                {tab === "blocked" && (
                  <Button variant="secondary" size="sm" onClick={() => void unblock(c.user_id)} loading={busy === c.user_id}>
                    {t("contacts.unblock")}
                  </Button>
                )}
              </div>
            ))}
          </>
        )}

        {!loading && !error && tab === "requests" && (
          <div className="flex flex-col gap-5 mt-3">
            <div>
              <p className="text-sm font-bold text-muted mb-1 px-1">{t("contacts.received")}</p>
              {received.length === 0 && <p className="text-sm text-muted px-1 py-2">{t("contacts.emptyRequests")}</p>}
              {received.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2">
                  <AvatarWithPresence src={r.other.avatar_url} name={r.other.display_name} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-[15px] truncate">{r.other.display_name}</span>
                    <span className="block text-[13px] text-muted truncate">@{r.other.username}</span>
                  </span>
                  <Button size="sm" onClick={() => void respond(r.id, "accept")} loading={busy === r.id}>{t("contacts.accept")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => void respond(r.id, "decline")} disabled={busy === r.id}>{t("contacts.decline")}</Button>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-bold text-muted mb-1 px-1">{t("contacts.sent")}</p>
              {sent.length === 0 && <p className="text-sm text-muted px-1 py-2">{t("contacts.emptyRequests")}</p>}
              {sent.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2">
                  <AvatarWithPresence src={r.other.avatar_url} name={r.other.display_name} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-[15px] truncate">{r.other.display_name}</span>
                    <span className="block text-[13px] text-muted truncate">@{r.other.username}</span>
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => void respond(r.id, "cancel")} loading={busy === r.id}>{t("contacts.cancelReq")}</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AddContactModal open={addOpen} onClose={() => setAddOpen(false)} onSent={() => { setTab("requests"); void load(); }} />

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => void removeContact()}
        title={t("contacts.remove")}
        description={removeTarget ? t("contacts.removeConfirmD", { name: removeTarget.display_name }) : ""}
        confirmLabel={t("contacts.remove")}
        danger
        loading={busy === removeTarget?.user_id}
      />
    </div>
  );
}

function AddContactModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sending, setSending] = useState(false);

  const search = useDebouncedCallback(async (term: string) => {
    const clean = term.trim().replace(/^@+/, "");
    if (clean.length < 2) {
      setFound(null);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/search?u=${encodeURIComponent(clean)}`);
      const json = (await res.json()) as { user?: FoundUser | null; error?: string };
      if (!res.ok) throw new Error(json.error);
      setFound(json.user ?? null);
      setSearched(true);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setLoading(false);
    }
  }, 400);

  const send = async () => {
    if (!found || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/contacts/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: found.username }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("contacts.requestSent"), "ok");
      setQ("");
      setFound(null);
      setSearched(false);
      onClose();
      onSent();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("contacts.addTitle")}>
      <p className="text-sm text-muted mb-3">{t("contacts.addDesc")}</p>
      <SearchInput value={q} onChange={(v) => { setQ(v); search(v); }} placeholder={t("contacts.addPh")} />
      <div className="mt-3 min-h-24">
        {loading && <div className="flex justify-center py-6 text-muted"><Spinner /></div>}
        {!loading && searched && !found && <EmptyState icon="search" title={t("conversations.noResults")} />}
        {!loading && found && (
          <div className="anim-fade-up flex items-center gap-3 p-3 rounded-2xl bg-surface2">
            <AvatarWithPresence src={found.avatar_url} name={found.display_name} size="sm" />
            <span className="flex-1 min-w-0">
              <span className="block font-bold truncate">{found.display_name}</span>
              <span className="block text-sm text-muted truncate">@{found.username}</span>
            </span>
            <Button size="sm" onClick={() => void send()} loading={sending}>{t("contacts.sendRequest")}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
