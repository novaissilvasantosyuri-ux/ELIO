"use client";

/**
 * Meu Perfil: foto, nome, @usuário, bio, status, cor, banner e presença.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Avatar, Button, Field, Icon, Input, Modal, SearchInput, Segmented, Spinner, Switch, Textarea,
} from "@/components/ui";
import { useApp, useToast } from "@/components/providers";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { supabaseBrowser } from "@/lib/supabase/client";
import { containCompress, randomName, storageUrl, validateImageFile, WALLPAPER_MAX_MB } from "@/lib/images";
import { useDebouncedCallback } from "@/lib/hooks";
import { fmtDateShort, friendlyError, normalizeUsername, validateUsername } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ACCENTS = ["#4B1FB0", "#4C6FFF", "#0E9F8A", "#C2255C", "#B25E09", "#1C7ED6"];
const BANNER_COLORS = ["#2E0F6B", "#4B1FB0", "#4C6FFF", "#0C8599", "#0E9F8A", "#C2255C", "#B25E09"];
const QUICK_EMOJI = ["😊", "🎧", "💼", "☕", "🌙", "🏖️", "📚", "💪", "🎮", "✨"];

export function ProfileEditor() {
  const { toast } = useToast();
  const { profile, setProfileLocal, user } = useApp();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [statusText, setStatusText] = useState("");
  const [statusEmoji, setStatusEmoji] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [presence, setPresence] = useState<"online" | "away" | "busy" | "invisible">("online");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [userState, setUserState] = useState<{ state: "idle" | "checking" | "ok" | "taken" | "invalid"; msg?: string; left?: number }>({ state: "idle" });
  const bannerRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (profile && !loaded.current) {
      loaded.current = true;
      setDisplayName(profile.display_name);
      setUsername(profile.username);
      setBio(profile.bio);
      setStatusText(profile.status_text);
      setStatusEmoji(profile.status_emoji);
      setAccent(profile.accent_color);
      setBanner(profile.banner_url);
      setPresence(profile.presence);
    }
  }, [profile]);

  const checkUsername = useDebouncedCallback(async (v: string) => {
    const clean = normalizeUsername(v);
    if (!clean || clean === profile?.username) {
      setUserState({ state: "idle" });
      return;
    }
    const invalid = validateUsername(clean);
    if (invalid) {
      setUserState({ state: "invalid", msg: invalid });
      return;
    }
    setUserState({ state: "checking" });
    try {
      const res = await fetch(`/api/username/check?u=${encodeURIComponent(clean)}`);
      const json = (await res.json()) as { available?: boolean; reason?: string; left?: number; error?: string };
      if (!res.ok) throw new Error(json.error);
      if (json.available) setUserState({ state: "ok", msg: t("auth.userOk"), left: json.left });
      else setUserState({ state: "taken", msg: json.reason ?? t("profile.usernameTaken"), left: json.left });
    } catch {
      setUserState({ state: "idle" });
    }
  }, 450);

  const dirty =
    !!profile &&
    (displayName !== profile.display_name ||
      normalizeUsername(username) !== profile.username ||
      bio !== profile.bio ||
      statusText !== profile.status_text ||
      statusEmoji !== profile.status_emoji ||
      accent !== profile.accent_color ||
      banner !== profile.banner_url ||
      presence !== profile.presence);

  const save = async () => {
    if (!dirty || saving) return;
    if (displayName.trim().length < 2 || displayName.trim().length > 40) {
      toast(t("errors.displayName"), "error");
      return;
    }
    if (userState.state === "taken" || userState.state === "invalid") {
      toast(userState.msg ?? t("profile.usernameInvalid"), "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          username: normalizeUsername(username),
          bio: bio.trim(),
          status_text: statusText.trim(),
          status_emoji: statusEmoji.trim(),
          accent_color: accent,
          banner_url: banner,
          presence,
        }),
      });
      const json = (await res.json()) as { profile?: typeof profile; error?: string };
      if (!res.ok || !json.profile) throw new Error(json.error);
      setProfileLocal(json.profile);
      setUserState({ state: "idle" });
      toast(t("profile.saved"), "ok");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const uploadBanner = async (f: File | undefined) => {
    if (!f || !user) return;
    const err = validateImageFile(f, WALLPAPER_MAX_MB);
    if (err) {
      toast(err, "error");
      return;
    }
    setUploadingBanner(true);
    try {
      const blob = await containCompress(f, 1600);
      const path = `${user.id}/${randomName()}`;
      const { error } = await supabaseBrowser().storage.from("banners").upload(path, blob, {
        contentType: "image/webp",
        upsert: false,
      });
      if (error) throw new Error("Não foi possível enviar. Tente de novo.");
      setBanner(path);
      toast("Banner atualizado — toque em Salvar. ✨", "ok");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setUploadingBanner(false);
    }
  };

  if (!profile) return null;

  const bannerStyle = banner
    ? banner.startsWith("#")
      ? { background: banner }
      : { backgroundImage: `url("${storageUrl("banners", banner)}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(135deg, var(--brand-deep), var(--accent))" };

  return (
    <div className="max-w-2xl mx-auto w-full px-4 tablet:px-6 py-5 pb-28 tablet:pb-10 flex flex-col gap-5">
      <h1 className="font-display font-extrabold text-[22px]">{t("profile.title")}</h1>

      {/* banner + foto */}
      <div className="rounded-3xl overflow-hidden border border-line bg-surface shadow-soft">
        <div className="h-28 tablet:h-36 relative" style={bannerStyle}>
          <div className="absolute right-3 bottom-3 flex gap-2">
            <button
              onClick={() => bannerRef.current?.click()}
              className="h-9 px-3 rounded-xl bg-black/45 text-white text-[13px] font-semibold backdrop-blur inline-flex items-center gap-1.5"
              disabled={uploadingBanner}
            >
              {uploadingBanner ? <Spinner size={15} /> : <Icon name="image" size={15} />}
              {t("profile.bannerImage")}
            </button>
            <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadBanner(e.target.files?.[0])} />
          </div>
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end justify-between">
            <span className="rounded-full border-4 border-surface">
              <Avatar src={storageUrl("avatars", profile.avatar_url)} name={displayName || "?"} size="xl" />
            </span>
            <Button variant="secondary" size="sm" onClick={() => setAvatarOpen(true)} icon="camera">
              {t("profile.changePhoto")}
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <p className="font-display font-extrabold text-xl">{displayName || profile.display_name}</p>
          </div>
          <p className="text-sm text-muted">@{normalizeUsername(username) || profile.username}</p>
          <p className="text-xs text-muted mt-2">{t("profile.memberSince", { date: fmtDateShort(profile.created_at) })}</p>
        </div>
      </div>

      {/* cores do banner */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <Field label={t("profile.banner")}>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBanner(null)}
              className={cn("h-10 px-4 rounded-xl text-sm font-semibold border", !banner ? "border-[var(--brand)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]" : "border-line")}
            >
              {t("profile.bannerNone")}
            </button>
            {BANNER_COLORS.map((c) => (
              <button
                key={c} onClick={() => setBanner(c)} aria-label={c}
                className={cn("w-10 h-10 rounded-xl border-2", banner === c ? "border-ink scale-105" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </div>

      {/* dados */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft flex flex-col gap-4">
        <Field label={t("profile.displayName")} error={null}>
          <Input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("auth.displayNamePh")} />
        </Field>
        <Field
          label={t("profile.username")}
          hint={userState.left !== undefined ? t("profile.usernameHint", { n: 3, left: userState.left }) : undefined}
          error={userState.state === "taken" || userState.state === "invalid" ? userState.msg : null}
        >
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold">@</span>
            <Input
              value={username} maxLength={20}
              onChange={(e) => { setUsername(e.target.value); checkUsername(e.target.value); }}
              className="pl-8" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {userState.state === "checking" && <Spinner size={17} />}
              {userState.state === "ok" && <Icon name="check" size={18} className="text-[var(--ok)]" />}
              {(userState.state === "taken" || userState.state === "invalid") && <Icon name="x" size={18} className="text-danger" />}
            </span>
          </div>
          {userState.state === "ok" && <p className="text-sm text-[var(--ok)] mt-1.5">{userState.msg}</p>}
        </Field>
        <Field label={t("profile.bio")}>
          <Textarea value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} placeholder={t("profile.bioPh")} />
          <p className="text-xs text-muted text-right">{bio.length}/160</p>
        </Field>
        <Field label={t("profile.status")}>
          <div className="flex gap-2">
            <Input
              value={statusEmoji} maxLength={16} onChange={(e) => setStatusEmoji(e.target.value)}
              placeholder="🎧" className="w-16 text-center" aria-label="Emoji do status"
            />
            <Input value={statusText} maxLength={80} onChange={(e) => setStatusText(e.target.value)} placeholder={t("profile.statusPh")} className="flex-1" />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {QUICK_EMOJI.map((e) => (
              <button key={e} onClick={() => setStatusEmoji(e)} className="w-9 h-9 text-xl rounded-xl hover:bg-surface2" aria-label={e}>{e}</button>
            ))}
          </div>
        </Field>
        <Field label={t("profile.accent")}>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c} onClick={() => setAccent(c)} aria-label={c}
                className={cn("w-10 h-10 rounded-full border-[3px]", accent === c ? "border-ink scale-105" : "border-white shadow")}
                style={{ background: c }}
              />
            ))}
            <label className="w-10 h-10 rounded-full border border-line bg-surface2 inline-flex items-center justify-center cursor-pointer overflow-hidden" title="Personalizada">
              <input type="color" value={accent ?? "#4B1FB0"} onChange={(e) => setAccent(e.target.value)} className="w-12 h-12 cursor-pointer" aria-label="Cor personalizada" />
            </label>
          </div>
        </Field>
        <Field label={t("profile.presence")}>
          <Segmented
            ariaLabel={t("profile.presence")} value={presence} onChange={setPresence}
            options={[
              { value: "online", label: t("profile.online") },
              { value: "away", label: t("profile.away") },
              { value: "busy", label: t("profile.busy") },
              { value: "invisible", label: t("profile.invisible") },
            ]}
          />
        </Field>
      </div>

      <div className="flex flex-col tablet:flex-row gap-2.5">
        <Button variant="secondary" full onClick={() => setPreviewOpen(true)} icon="eye">
          {t("profile.viewAs")}
        </Button>
        <Button full onClick={() => void save()} loading={saving} disabled={!dirty}>
          {t("profile.saveBtn")}
        </Button>
      </div>
      {!dirty && <p className="text-center text-xs text-muted -mt-2">{t("profile.noChanges")}</p>}

      <AvatarEditor open={avatarOpen} onClose={() => setAvatarOpen(false)} onSaved={(path) => setProfileLocal({ avatar_url: path })} />

      {/* prévia pública */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={t("profile.viewAs")}>
        <p className="text-sm text-muted mb-4">{t("profile.viewAsDesc")}</p>
        <div className="rounded-3xl overflow-hidden border border-line">
          <div className="h-24" style={bannerStyle} />
          <div className="p-5 bg-surface">
            <div className="-mt-12 mb-2">
              <span className="rounded-full border-4 border-surface inline-block">
                <Avatar src={storageUrl("avatars", profile.avatar_url)} name={displayName} size="lg" />
              </span>
            </div>
            <p className="font-display font-extrabold text-lg">{displayName}</p>
            <p className="text-sm text-muted">@{normalizeUsername(username)}</p>
            {bio && <p className="text-sm mt-2">{bio}</p>}
            {(statusEmoji || statusText) && (
              <p className="text-sm mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface2">
                {statusEmoji} {statusText}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
