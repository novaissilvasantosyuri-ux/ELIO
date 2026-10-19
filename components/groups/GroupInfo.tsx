"use client";

/**
 * Dados do grupo: nome, descrição, convite, membros e ações de gestão.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Avatar, Button, ConfirmDialog, Dropdown, EmptyState, ErrorState, Icon,
  IconButton, Input, Modal, Spinner, Textarea, type MenuItem,
} from "@/components/ui";
import { useToast } from "@/components/providers";
import { MemberPicker } from "@/components/groups/MemberPicker";
import { pickFile, squareCrop } from "@/lib/media";
import { friendlyError, cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { GroupInfo as GroupInfoData, GroupMember, MemberRole } from "@/lib/supabase/types";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: t("groups.owner"),
  admin: t("groups.admin"),
  member: t("groups.member"),
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function GroupInfo({
  conversationId, open, onClose, onChanged, onLeft, myId,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
  myId: string;
}) {
  const { toast } = useToast();
  const [info, setInfo] = useState<GroupInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"title" | "desc" | null>(null);
  const [titleVal, setTitleVal] = useState("");
  const [descVal, setDescVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busyAdd, setBusyAdd] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "remove" | "transfer" | "leave"; member?: GroupMember } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/members`);
      const json = (await res.json()) as GroupInfoData & { error?: string };
      if (!res.ok) throw new Error(json.error);
      setInfo(json);
      setTitleVal(json.conversation.title);
      setDescVal(json.conversation.description);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const isAdmin = info?.my_role === "owner" || info?.my_role === "admin";
  const isOwner = info?.my_role === "owner";

  async function saveTitleDesc() {
    if (!info || saving) return;
    const title = titleVal.trim();
    if (!title) {
      toast(t("groups.namePh"), "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_title: title, group_description: descVal.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      setEditing(null);
      toast(t("groups.saved"), "ok");
      await load();
      onChanged();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function changePhoto() {
    if (photoBusy) return;
    const file = await pickFile("image/jpeg,image/png,image/webp");
    if (!file) return;
    setPhotoBusy(true);
    try {
      const blob = await squareCrop(file);
      const form = new FormData();
      form.set("file", blob, "avatar.webp");
      const res = await fetch(`/api/conversations/${conversationId}/avatar`, { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("media.groupPhotoOk"), "ok");
      await load();
      onChanged();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function runAction(body: Record<string, unknown>, okMsg?: string) {
    const res = await fetch(`/api/conversations/${conversationId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; added?: number; skipped?: string[]; code?: string };
    if (!res.ok) throw new Error(json.error);
    if (okMsg) toast(okMsg, "ok");
    await load();
    onChanged();
    return json;
  }

  async function addMembers(ids: string[]) {
    setBusyAdd(true);
    try {
      const r = await runAction({ action: "add", member_ids: ids });
      setAddOpen(false);
      toast(t("groups.added", { n: r.added ?? ids.length }), "ok");
      if (r.skipped && r.skipped.length > 0) toast(t("groups.addSomeSkipped"), "info");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusyAdd(false);
    }
  }

  async function doConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "leave") {
        await runAction({ action: "leave" });
        toast(t("groups.left"), "ok");
        setConfirm(null);
        onClose();
        onLeft();
      } else if (confirm.kind === "remove" && confirm.member) {
        await runAction({ action: "remove", user_id: confirm.member.user_id }, t("groups.removed"));
        setConfirm(null);
      } else if (confirm.kind === "transfer" && confirm.member) {
        await runAction({ action: "role", user_id: confirm.member.user_id, role: "owner" }, t("groups.roleChanged"));
        setConfirm(null);
      }
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setConfirmBusy(false);
    }
  }

  const memberMenu = (m: GroupMember): MenuItem[] => {
    const items: MenuItem[] = [];
    const isSelf = m.user_id === myId;
    if (isOwner && !isSelf && m.role !== "owner") {
      items.push(
        m.role === "admin"
          ? { label: t("groups.removeAdmin"), icon: "shield", onSelect: () => void runAction({ action: "role", user_id: m.user_id, role: "member" }, t("groups.roleChanged")).catch((e) => toast(friendlyError(e), "error")) }
          : { label: t("groups.makeAdmin"), icon: "shield", onSelect: () => void runAction({ action: "role", user_id: m.user_id, role: "admin" }, t("groups.roleChanged")).catch((e) => toast(friendlyError(e), "error")) },
        { label: t("groups.transferOwner"), icon: "refresh", onSelect: () => setConfirm({ kind: "transfer", member: m }) },
      );
    }
    if (isAdmin && !isSelf && m.role !== "owner") {
      items.push({ label: t("groups.remove"), icon: "trash", danger: true, onSelect: () => setConfirm({ kind: "remove", member: m }) });
    }
    return items;
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={t("groups.info")} wide>
        {loading && (
          <div className="flex justify-center py-10 text-muted"><Spinner /></div>
        )}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
        {!loading && !error && info && (
          <div className="flex flex-col gap-5">
            {/* cabeçalho do grupo */}
            <div className="flex items-center gap-4">
              <span className="relative inline-flex shrink-0">
                <Avatar src={info.conversation.avatar_url} name={info.conversation.title} size="lg" />
                {isAdmin && (
                  <button
                    onClick={() => void changePhoto()}
                    disabled={photoBusy}
                    aria-label={t("media.groupPhoto")}
                    className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand text-white shadow-soft hover:brightness-110 disabled:opacity-60"
                  >
                    {photoBusy ? <Spinner size={16} /> : <Icon name="camera" size={17} />}
                  </button>
                )}
              </span>
              <div className="flex-1 min-w-0">
                {editing === "title" ? (
                  <div className="flex gap-2">
                    <Input value={titleVal} onChange={(e) => setTitleVal(e.target.value)} maxLength={60} aria-label={t("groups.nameLabel")} />
                    <Button onClick={() => void saveTitleDesc()} loading={saving}>{t("groups.save")}</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-extrabold text-xl truncate">{info.conversation.title}</h3>
                    {isAdmin && (
                      <IconButton label={t("groups.edit")} onClick={() => setEditing("title")} className="w-8 h-8">
                        <Icon name="edit" size={16} />
                      </IconButton>
                    )}
                  </div>
                )}
                <p className="text-sm text-muted">{t("groups.members", { n: info.conversation.members_count })}</p>
              </div>
            </div>

            {/* descrição */}
            <div className="rounded-2xl bg-surface2 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-1">{t("groups.description")}</p>
              {editing === "desc" ? (
                <div className="flex flex-col gap-2">
                  <Textarea value={descVal} onChange={(e) => setDescVal(e.target.value)} maxLength={300} rows={2} placeholder={t("groups.descPh")} />
                  <div className="flex justify-end">
                    <Button onClick={() => void saveTitleDesc()} loading={saving}>{t("groups.save")}</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[15px] whitespace-pre-wrap">
                    {info.conversation.description || t("groups.noDesc")}
                  </p>
                  {isAdmin && (
                    <IconButton label={t("groups.edit")} onClick={() => setEditing("desc")} className="w-8 h-8">
                      <Icon name="edit" size={16} />
                    </IconButton>
                  )}
                </div>
              )}
            </div>

            {/* convite */}
            <div className="rounded-2xl bg-surface2 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-1">{t("groups.inviteTitle")}</p>
              <p className="text-sm text-muted mb-2">{t("groups.inviteDesc")}</p>
              {info.conversation.invite_code ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate px-3 h-11 inline-flex items-center rounded-xl bg-surface border border-line font-mono text-sm">
                    {info.conversation.invite_code}
                  </code>
                  <IconButton
                    label={t("groups.copied")}
                    onClick={() => void copyText(info.conversation.invite_code ?? "").then((ok) => toast(ok ? t("groups.copied") : t("errors.generic"), ok ? "ok" : "error"))}
                  >
                    <Icon name="copy" size={19} />
                  </IconButton>
                  {isAdmin && (
                    <IconButton
                      label={t("groups.regenerate")}
                      onClick={() => {
                        setRotating(true);
                        runAction({ action: "rotate_invite" })
                          .catch((e) => toast(friendlyError(e), "error"))
                          .finally(() => setRotating(false));
                      }}
                    >
                      {rotating ? <Spinner size={18} /> : <Icon name="refresh" size={19} />}
                    </IconButton>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-muted">{t("groups.noInvite")}</p>
                  {isAdmin && (
                    <Button
                      variant="secondary"
                      loading={rotating}
                      onClick={() => {
                        setRotating(true);
                        runAction({ action: "rotate_invite" })
                          .catch((e) => toast(friendlyError(e), "error"))
                          .finally(() => setRotating(false));
                      }}
                    >
                      {t("groups.generate")}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* membros */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {t("groups.members", { n: info.members.length })}
                </p>
                {isAdmin && (
                  <button
                    onClick={() => setAddOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-brand"
                  >
                    <Icon name="plus" size={16} />{t("groups.addMembers")}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                {info.members.map((m) => {
                  const menu = memberMenu(m);
                  return (
                    <div key={m.user_id} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-surface2">
                      <Avatar src={m.avatar_url} name={m.display_name} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate text-[15px]">
                          {m.display_name}
                          {m.user_id === myId && <span className="text-muted font-medium"> ({t("groups.you")})</span>}
                        </span>
                        <span className="block text-[13px] text-muted truncate">@{m.username}</span>
                      </span>
                      <span className={cn(
                        "text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0",
                        m.role === "owner" ? "bg-brand text-white" : m.role === "admin" ? "bg-brand-soft text-brand" : "bg-surface2 text-muted",
                      )}>
                        {ROLE_LABEL[m.role]}
                      </span>
                      {menu.length > 0 && (
                        <Dropdown
                          trigger={
                            <span className="inline-flex">
                              <IconButton label={m.display_name} onClick={() => {}}>
                                <Icon name="dots" size={19} />
                              </IconButton>
                            </span>
                          }
                          items={menu}
                        />
                      )}
                    </div>
                  );
                })}
                {info.members.length === 0 && <EmptyState icon="users" title={t("groups.members", { n: 0 })} />}
              </div>
            </div>

            {/* sair */}
            <div>
              <Button variant="danger" full onClick={() => setConfirm({ kind: "leave" })}>
                {t("groups.leave")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* adicionar pessoas */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t("groups.addTitle")}>
        <MemberPicker
          excludeIds={(info?.members ?? []).map((m) => m.user_id)}
          confirmLabel={t("groups.addMembers")}
          busy={busyAdd}
          onConfirm={(ids) => void addMembers(ids)}
        />
      </Modal>

      {/* confirmações */}
      <ConfirmDialog
        open={confirm?.kind === "remove"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void doConfirm()}
        title={t("groups.remove")}
        description={t("groups.removeConfirm")}
        confirmLabel={t("groups.remove")}
        danger
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm?.kind === "transfer"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void doConfirm()}
        title={t("groups.transferOwner")}
        description={t("groups.transferConfirm")}
        confirmLabel={t("conversations.confirm")}
        loading={confirmBusy}
      />
      <ConfirmDialog
        open={confirm?.kind === "leave"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void doConfirm()}
        title={t("groups.leave")}
        description={t("groups.leaveConfirm")}
        confirmLabel={t("groups.leave")}
        danger
        loading={confirmBusy}
      />
    </>
  );
}
