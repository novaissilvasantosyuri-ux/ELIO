"use client";

/**
 * Nova conversa: DM por @usuário, criar grupo ou entrar com convite.
 */
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, EmptyState, Field, Input, Modal, SearchInput, Spinner, Tabs } from "@/components/ui";
import { MemberPicker } from "@/components/groups/MemberPicker";
import { useToast } from "@/components/providers";
import { useDebouncedCallback } from "@/lib/hooks";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { FoundUser } from "@/lib/supabase/types";

type Tab = "dm" | "group" | "invite";

function DmTab({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const start = async () => {
    if (!found || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: found.username }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error);
      onDone();
      router.push(`/conversas/${json.id}`);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted mb-3">{t("conversations.newDesc")}</p>
      <SearchInput value={q} onChange={(v) => { setQ(v); search(v); }} placeholder={t("conversations.newPh")} />
      <div className="mt-3 min-h-24">
        {loading && <div className="flex justify-center py-6 text-muted"><Spinner /></div>}
        {!loading && searched && !found && (
          <EmptyState icon="search" title={t("conversations.noResults")} />
        )}
        {!loading && found && (
          <button
            onClick={() => void start()}
            disabled={creating}
            className="anim-fade-up w-full flex items-center gap-3 p-3 rounded-2xl bg-surface2 hover:bg-[var(--line)] text-left transition-colors disabled:opacity-60"
          >
            <Avatar src={found.avatar_url} name={found.display_name} />
            <span className="flex-1 min-w-0">
              <span className="block font-bold truncate">{found.display_name}</span>
              <span className="block text-sm text-muted truncate">@{found.username}</span>
            </span>
            {creating ? <Spinner size={20} /> : (
              <span className="text-sm font-bold text-brand shrink-0">{t("contacts.message")} →</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function GroupTab({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async (memberIds: string[]) => {
    const name = title.trim();
    if (!name) {
      toast(t("groups.namePh"), "error");
      return;
    }
    if (memberIds.length === 0) {
      toast(t("groups.needOne"), "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: { title: name, member_ids: memberIds } }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error);
      toast(t("groups.created"), "ok");
      onDone();
      router.push(`/conversas/${json.id}`);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted mb-3">{t("groups.newDesc")}</p>
      <Field label={t("groups.nameLabel")}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={t("groups.namePh")} />
      </Field>
      <p className="text-xs font-bold uppercase tracking-wide text-muted mt-4 mb-1">{t("groups.membersLabel")}</p>
      <MemberPicker confirmLabel={t("groups.create")} busy={creating} onConfirm={(ids) => void create(ids)} />
    </div>
  );
}

function InviteTab({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const join = async () => {
    const clean = code.trim();
    if (!clean) return;
    setJoining(true);
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const json = (await res.json()) as { id?: string; joined?: boolean; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error);
      toast(t("groups.joined"), "ok");
      onDone();
      router.push(`/conversas/${json.id}`);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted mb-3">{t("groups.joinDesc")}</p>
      <Field label={t("groups.codePh")}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={64}
          placeholder={t("groups.codePh")}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>
      <div className="mt-4">
        <Button full loading={joining} disabled={!code.trim()} onClick={() => void join()}>
          {t("groups.join")}
        </Button>
      </div>
    </div>
  );
}

export function NewConversationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("dm");
  return (
    <Modal open={open} onClose={onClose} title={t("conversations.newTitle")}>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "dm", label: t("groups.tabChat") },
          { value: "group", label: t("groups.tabGroup") },
          { value: "invite", label: t("groups.tabInvite") },
        ]}
      />
      <div className="mt-4">
        {tab === "dm" && <DmTab onDone={onClose} />}
        {tab === "group" && <GroupTab onDone={onClose} />}
        {tab === "invite" && <InviteTab onDone={onClose} />}
      </div>
      <div className="mt-4">
        <Button variant="ghost" full onClick={onClose}>{t("conversations.cancel")}</Button>
      </div>
    </Modal>
  );
}
