"use client";

/**
 * Detalhe da comunidade: canais, membros e dados/gestão.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar, AvatarWithPresence, Button, ConfirmDialog, Dropdown, EmptyState,
  ErrorState, Field, Icon, IconButton, Input, Modal, Spinner, Switch, Tabs, Textarea,
  type MenuItem,
} from "@/components/ui";
import { useApp, useToast } from "@/components/providers";
import { pickFile, squareCrop } from "@/lib/media";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type {
  ChannelSummary, CommunityDetail as CommunityDetailData, CommunityMember, CommunityRole,
} from "@/lib/supabase/types";

const ROLE_LABEL: Record<CommunityRole, string> = {
  owner: t("communities.owner"),
  admin: t("communities.admin"),
  moderator: t("communities.moderator"),
  member: t("communities.member"),
};

type Tab = "channels" | "members" | "info";

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

export function CommunityDetail({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, presenceMap } = useApp();
  const [data, setData] = useState<CommunityDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("channels");
  const [busy, setBusy] = useState<string | null>(null);

  const [channelOpen, setChannelOpen] = useState(false);
  const [channelTitle, setChannelTitle] = useState("");
  const [channelNews, setChannelNews] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChannelSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChannelSummary | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CommunityMember | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/communities/${id}`);
      const json = (await res.json()) as CommunityDetailData & { error?: string };
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <ErrorState message={error ?? t("errors.generic")} onRetry={() => { setLoading(true); void load(); }} />
      </div>
    );
  }

  const { community, my_role, channels, members } = data;
  const isOwner = my_role === "owner";
  const canAdmin = isOwner || my_role === "admin";

  async function postMembers(body: Record<string, unknown>, okMsg: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/communities/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(okMsg, "ok");
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function createChannel() {
    if (busy || !channelTitle.trim()) return;
    setBusy("new-channel");
    try {
      const res = await fetch(`/api/communities/${id}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: channelTitle.trim(), is_announcement: channelNews }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.channelCreated"), "ok");
      setChannelOpen(false);
      setChannelTitle("");
      setChannelNews(false);
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function renameChannel() {
    if (busy || !renameTarget || !renameTitle.trim()) return;
    setBusy(`rename-${renameTarget.id}`);
    try {
      const res = await fetch(`/api/channels/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameTitle.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.renamed"), "ok");
      setRenameTarget(null);
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function deleteChannel() {
    if (busy || !deleteTarget) return;
    setBusy(`delete-${deleteTarget.id}`);
    try {
      const res = await fetch(`/api/channels/${deleteTarget.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.channelDeleted"), "ok");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveInfo() {
    if (busy || !editName.trim()) return;
    setBusy("save-info");
    try {
      const res = await fetch(`/api/communities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.saved"), "ok");
      setEditing(false);
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function rotateInvite() {
    if (busy) return;
    setBusy("rotate");
    try {
      const res = await fetch(`/api/communities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate_invite: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.regenerated"), "ok");
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
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
      const res = await fetch(`/api/communities/${id}/avatar`, { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.photoOk"), "ok");
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function leave() {
    if (busy) return;
    setBusy("leave");
    try {
      const res = await fetch(`/api/communities/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("communities.left"), "ok");
      router.push("/comunidades");
    } catch (e) {
      toast(friendlyError(e), "error");
      setBusy(null);
    }
  }

  function memberMenu(m: CommunityMember): MenuItem[] {
    const items: MenuItem[] = [];
    const isSelf = m.user_id === user?.id;
    if (isOwner && !isSelf) {
      if (m.role !== "admin") {
        items.push({
          label: t("communities.makeAdmin"), icon: "shield",
          onSelect: () => void postMembers({ action: "role", user_id: m.user_id, role: "admin" }, t("communities.roleChanged"), `role-${m.user_id}`),
        });
      }
      if (m.role !== "moderator") {
        items.push({
          label: t("communities.makeModerator"), icon: "eye",
          onSelect: () => void postMembers({ action: "role", user_id: m.user_id, role: "moderator" }, t("communities.roleChanged"), `role-${m.user_id}`),
        });
      }
      if (m.role !== "member") {
        items.push({
          label: t("communities.makeMember"), icon: "user",
          onSelect: () => void postMembers({ action: "role", user_id: m.user_id, role: "member" }, t("communities.roleChanged"), `role-${m.user_id}`),
        });
      }
    }
    if (canAdmin && !isSelf) {
      items.push({
        label: t("communities.remove"), icon: "trash", danger: true,
        onSelect: () => setRemoveTarget(m),
      });
    }
    return items;
  }

  function channelMenu(ch: ChannelSummary): MenuItem[] {
    return [
      {
        label: t("communities.rename"), icon: "edit",
        onSelect: () => { setRenameTarget(ch); setRenameTitle(ch.title); },
      },
      {
        label: t("communities.deleteChannel"), icon: "trash", danger: true,
        onSelect: () => setDeleteTarget(ch),
      },
    ];
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 tablet:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <IconButton label={t("a11y.back")} onClick={() => router.push("/comunidades")}>
            <Icon name="back" size={20} />
          </IconButton>
          <Avatar src={community.avatar_url} name={community.name} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-extrabold text-xl truncate">{community.name}</h1>
            <p className="text-sm text-muted">
              {t("communities.members", { n: community.members_count })}
              {" · "}
              {ROLE_LABEL[my_role]}
            </p>
          </div>
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "channels", label: t("communities.channels"), count: channels.length },
            { value: "members", label: t("groups.membersLabel"), count: members.length },
            { value: "info", label: t("communities.info") },
          ]}
        />

        {tab === "channels" && (
          <div className="space-y-3">
            {canAdmin && (
              <Button variant="secondary" full icon="plus" onClick={() => setChannelOpen(true)}>
                {t("communities.newChannel")}
              </Button>
            )}
            {channels.length === 0 ? (
              <EmptyState icon="chat" title={t("communities.channels")} />
            ) : (
              <ul className="space-y-2">
                {channels.map((ch) => (
                  <li
                    key={ch.id}
                    className="flex items-center gap-3 bg-surface rounded-2xl p-3 hover:bg-surface2 transition-colors"
                  >
                    <button
                      onClick={() => router.push(`/conversas/${ch.id}`)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    >
                      <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand inline-flex items-center justify-center shrink-0">
                        <Icon name={ch.is_announcement ? "bell" : "chat"} size={19} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold truncate">#{ch.title}</span>
                        {ch.is_announcement && (
                          <span className="block text-xs text-muted">{t("communities.announcement")}</span>
                        )}
                      </span>
                    </button>
                    {canAdmin && (
                      <Dropdown
                        trigger={
                          <span className="inline-flex">
                            <IconButton label={t("a11y.menu")} onClick={() => {}}>
                              <Icon name="dots" size={18} />
                            </IconButton>
                          </span>
                        }
                        items={channelMenu(ch)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "members" && (
          <ul className="space-y-2">
            {members.map((m) => {
              const live = presenceMap[m.user_id];
              const menu = memberMenu(m);
              return (
                <li key={m.user_id} className="flex items-center gap-3 bg-surface rounded-2xl p-3">
                  <AvatarWithPresence
                    src={m.avatar_url} name={m.display_name}
                    presence={live?.presence ?? m.presence}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate">
                      {m.display_name}
                      {m.user_id === user?.id ? ` (${t("communities.you")})` : ""}
                    </span>
                    <span className="block text-xs text-muted">@{m.username}</span>
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface2 text-muted shrink-0">
                    {ROLE_LABEL[m.role]}
                  </span>
                  {menu.length > 0 && (
                    <Dropdown
                      trigger={
                        <span className="inline-flex">
                          <IconButton label={t("a11y.menu")} onClick={() => {}}>
                            <Icon name="dots" size={18} />
                          </IconButton>
                        </span>
                      }
                      items={menu}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tab === "info" && (
          <div className="space-y-4">
            <div className="bg-surface rounded-2xl p-4 flex items-center gap-4">
              <Avatar src={community.avatar_url} name={community.name} size="lg" />
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-3">
                    <Field label={t("communities.nameLabel")} htmlFor="e-name">
                      <Input
                        id="e-name" value={editName} onChange={(e) => setEditName(e.target.value)}
                        maxLength={60}
                      />
                    </Field>
                    <Field label={t("groups.description")} htmlFor="e-desc">
                      <Textarea
                        id="e-desc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                        maxLength={300} rows={2}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" full onClick={() => setEditing(false)}>
                        {t("conversations.cancel")}
                      </Button>
                      <Button
                        size="sm" full loading={busy === "save-info"}
                        disabled={!editName.trim()} onClick={() => void saveInfo()}
                      >
                        {t("communities.save")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-bold">{community.name}</p>
                    <p className="text-sm text-muted">
                      {community.description || t("communities.noDesc")}
                    </p>
                    {canAdmin && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="secondary" size="sm" icon="edit"
                          onClick={() => { setEditName(community.name); setEditDesc(community.description); setEditing(true); }}
                        >
                          {t("communities.edit")}
                        </Button>
                        <Button
                          variant="secondary" size="sm" icon="camera"
                          loading={photoBusy} onClick={() => void changePhoto()}
                        >
                          {t("communities.photo")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="bg-surface rounded-2xl p-4 space-y-2">
              <p className="font-bold">{t("communities.inviteTitle")}</p>
              <p className="text-sm text-muted">{t("communities.inviteDesc")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-surface2 rounded-xl px-3 py-2.5 font-mono text-sm truncate">
                  {community.invite_code}
                </code>
                <IconButton
                  label={t("communities.copied")}
                  onClick={() => void copyText(community.invite_code).then((ok) => toast(ok ? t("communities.copied") : t("errors.generic"), ok ? "ok" : "error"))}
                  className="bg-surface2"
                >
                  <Icon name="copy" size={18} />
                </IconButton>
              </div>
              {canAdmin && (
                <Button
                  variant="secondary" size="sm" icon="refresh"
                  loading={busy === "rotate"} onClick={() => void rotateInvite()}
                >
                  {t("communities.regenerate")}
                </Button>
              )}
            </div>

            <Button
              variant="outline" full icon="logout"
              onClick={() => setLeaveOpen(true)}
              className="!text-danger !border-danger/40"
            >
              {t("communities.leave")}
            </Button>
          </div>
        )}

        <Modal open={channelOpen} onClose={() => setChannelOpen(false)} title={t("communities.newChannel")}>
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("communities.newChannelDesc")}</p>
            <Field label={t("communities.channels")} htmlFor="ch-title">
              <Input
                id="ch-title" value={channelTitle} onChange={(e) => setChannelTitle(e.target.value)}
                placeholder={t("communities.channelNamePh")} maxLength={60} autoFocus
              />
            </Field>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch checked={channelNews} onChange={setChannelNews} label={t("communities.announcement")} />
              <span className="text-sm font-semibold">{t("communities.announcement")}</span>
            </label>
            <Button
              full loading={busy === "new-channel"} disabled={!channelTitle.trim()}
              icon="plus" onClick={() => void createChannel()}
            >
              {t("communities.createChannel")}
            </Button>
          </div>
        </Modal>

        <Modal
          open={renameTarget !== null}
          onClose={() => setRenameTarget(null)}
          title={t("communities.renameChannel")}
        >
          <div className="space-y-4">
            <Field label={t("communities.channels")} htmlFor="ch-rename">
              <Input
                id="ch-rename" value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)}
                maxLength={60} autoFocus
              />
            </Field>
            <Button
              full loading={busy === `rename-${renameTarget?.id}`} disabled={!renameTitle.trim()}
              onClick={() => void renameChannel()}
            >
              {t("communities.save")}
            </Button>
          </div>
        </Modal>

        <ConfirmDialog
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void deleteChannel()}
          title={t("communities.deleteChannel")}
          description={t("communities.deleteChannelConfirm")}
          confirmLabel={t("communities.deleteChannel")}
          danger
          loading={busy === `delete-${deleteTarget?.id}`}
        />

        <ConfirmDialog
          open={removeTarget !== null}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => {
            if (!removeTarget) return;
            const target = removeTarget;
            setRemoveTarget(null);
            void postMembers({ action: "remove", user_id: target.user_id }, t("communities.removed"), `remove-${target.user_id}`);
          }}
          title={t("communities.remove")}
          description={t("communities.removeConfirm")}
          confirmLabel={t("communities.remove")}
          danger
        />

        <ConfirmDialog
          open={leaveOpen}
          onClose={() => setLeaveOpen(false)}
          onConfirm={() => { setLeaveOpen(false); void leave(); }}
          title={t("communities.leave")}
          description={isOwner ? t("communities.leaveOwner") : t("communities.leaveConfirm")}
          confirmLabel={t("communities.leave")}
          danger
          loading={busy === "leave"}
        />
      </div>
    </div>
  );
}
