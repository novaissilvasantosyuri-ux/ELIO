"use client";

/**
 * Onboarding guiado e pulável: perfil, aparência, notificações, tour e privacidade.
 */
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Field, Icon, Input, Segmented, Spinner, Switch } from "@/components/ui";
import { ElioLogo } from "@/components/brand";
import { useApp, useToast } from "@/components/providers";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { storageUrl } from "@/lib/images";
import { useDebouncedCallback } from "@/lib/hooks";
import { friendlyError, normalizeUsername, validateUsername } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STEPS = ["welcome", "profile", "appearance", "notifications", "tour", "privacy"] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const { profile, settings, setProfileLocal, setSettingsLocal, refreshAll } = useApp();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [userOk, setUserOk] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  const [theme, setTheme] = useState<"light" | "dark" | "auto">(settings?.theme ?? "auto");
  const [accent, setAccent] = useState(settings?.accent ?? "#4B1FB0");
  const [sound, setSound] = useState(settings?.sound_enabled ?? true);
  const [preview, setPreview] = useState(settings?.preview_text ?? true);
  const [read, setRead] = useState(settings?.read_receipts ?? true);
  const [lastSeen, setLastSeen] = useState(settings?.show_last_seen ?? true);
  const [findable, setFindable] = useState(settings?.findable_by_username ?? true);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const check = useDebouncedCallback(async (v: string) => {
    const clean = normalizeUsername(v);
    if (!clean || clean === profile?.username) {
      setUserOk("idle");
      return;
    }
    if (validateUsername(clean)) {
      setUserOk("bad");
      return;
    }
    setUserOk("checking");
    try {
      const res = await fetch(`/api/username/check?u=${encodeURIComponent(clean)}`);
      const json = (await res.json()) as { available?: boolean };
      setUserOk(json.available ? "ok" : "bad");
    } catch {
      setUserOk("idle");
    }
  }, 450);

  const skip = async () => {
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch { /* ok */ }
    router.push("/conversas");
  };

  const finish = async () => {
    if (displayName.trim().length < 2) {
      toast(t("errors.displayName"), "error");
      setStep(1);
      return;
    }
    if (userOk === "bad") {
      toast(t("profile.usernameTaken"), "error");
      setStep(1);
      return;
    }
    setFinishing(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: displayName.trim(), username: normalizeUsername(username) }),
        }),
        fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            theme, accent, sound_enabled: sound, preview_text: preview,
            read_receipts: read, show_last_seen: lastSeen, findable_by_username: findable,
          }),
        }),
      ]);
      if (!pRes.ok) throw new Error((await pRes.json().catch(() => ({}))).error);
      if (!sRes.ok) throw new Error((await sRes.json().catch(() => ({}))).error);
      await fetch("/api/onboarding", { method: "POST" });
      await refreshAll();
      toast(t("onboarding.done"), "ok");
      router.push("/conversas");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setFinishing(false);
    }
  };

  const name = STEPS[step] ?? "welcome";
  const total = STEPS.length;

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-8 max-w-lg mx-auto w-full">
      <ElioLogo />
      <div className="w-full mt-6 mb-2 flex items-center gap-2" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-[var(--brand)]" : "bg-[var(--line)]")} />
        ))}
      </div>
      <p className="text-xs text-muted mb-4">{t("onboarding.step", { n: step + 1, total })}</p>

      <div key={name} className="anim-fade-up w-full rounded-3xl border border-line bg-surface shadow-soft p-6 flex flex-col gap-4">
        {name === "welcome" && (
          <>
            <h1 className="font-display font-extrabold text-2xl text-center">{t("onboarding.welcome")}</h1>
            <p className="text-muted text-center leading-relaxed">{t("onboarding.welcomeDesc")}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["user", t("onboarding.profileT")], ["moon", t("onboarding.appearanceT")], ["shield", t("onboarding.privacyT")]].map(([icon, label]) => (
                <span key={label as string} className="rounded-2xl bg-surface2 py-4 px-2 flex flex-col items-center gap-1.5 text-[13px] font-semibold">
                  <Icon name={(icon as "user" | "moon" | "shield")} size={22} className="text-brand" />
                  {label as string}
                </span>
              ))}
            </div>
          </>
        )}

        {name === "profile" && (
          <>
            <h2 className="font-display font-extrabold text-xl">{t("onboarding.profileT")}</h2>
            <p className="text-sm text-muted -mt-2">{t("onboarding.profileD")}</p>
            <div className="flex items-center gap-4">
              <Avatar src={storageUrl("avatars", profile?.avatar_url ?? null)} name={displayName || "?"} size="lg" />
              <Button variant="secondary" size="sm" onClick={() => setAvatarOpen(true)} icon="camera">
                {t("onboarding.changePhoto")}
              </Button>
            </div>
            <Field label={t("auth.displayName")}>
              <Input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label={t("auth.username")}>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold">@</span>
                <Input value={username} maxLength={20} onChange={(e) => { setUsername(e.target.value); check(e.target.value); }} className="pl-8" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {userOk === "checking" && <Spinner size={17} />}
                  {userOk === "ok" && <Icon name="check" size={18} className="text-[var(--ok)]" />}
                  {userOk === "bad" && <Icon name="x" size={18} className="text-danger" />}
                </span>
              </div>
            </Field>
          </>
        )}

        {name === "appearance" && (
          <>
            <h2 className="font-display font-extrabold text-xl">{t("onboarding.appearanceT")}</h2>
            <p className="text-sm text-muted -mt-2">{t("onboarding.appearanceD")}</p>
            <Segmented
              ariaLabel={t("settings.theme")} value={theme}
              onChange={(v) => { setTheme(v); setSettingsLocal({ theme: v }); }}
              options={[
                { value: "light", label: t("settings.light"), icon: "sun" },
                { value: "dark", label: t("settings.dark"), icon: "moon" },
                { value: "auto", label: t("settings.auto"), icon: "auto" },
              ]}
            />
            <div className="flex gap-2">
              {["#4B1FB0", "#4C6FFF", "#0E9F8A", "#C2255C", "#B25E09"].map((c) => (
                <button
                  key={c} onClick={() => { setAccent(c); setSettingsLocal({ accent: c }); }} aria-label={c}
                  className={cn("w-11 h-11 rounded-2xl border-[3px]", accent === c ? "border-ink" : "border-transparent")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </>
        )}

        {name === "notifications" && (
          <>
            <h2 className="font-display font-extrabold text-xl">{t("onboarding.notificationsT")}</h2>
            <p className="text-sm text-muted -mt-2">{t("onboarding.notificationsD")}</p>
            <div className="flex items-center justify-between min-h-[52px]">
              <span className="font-semibold">{t("onboarding.sound")}</span>
              <Switch checked={sound} onChange={setSound} label={t("onboarding.sound")} />
            </div>
            <div className="flex items-center justify-between min-h-[52px]">
              <span className="font-semibold">{t("onboarding.preview")}</span>
              <Switch checked={preview} onChange={setPreview} label={t("onboarding.preview")} />
            </div>
          </>
        )}

        {name === "tour" && (
          <>
            <h2 className="font-display font-extrabold text-xl">{t("onboarding.tourT")}</h2>
            <p className="text-sm text-muted -mt-2">{t("onboarding.tourD")}</p>
            {[t("onboarding.tour1"), t("onboarding.tour2"), t("onboarding.tour3")].map((x, i) => (
              <p key={i} className="flex gap-3 items-start rounded-2xl bg-surface2 p-4 text-sm leading-relaxed">
                <span className="w-7 h-7 shrink-0 rounded-full bg-[var(--brand)] text-white inline-flex items-center justify-center font-bold text-[13px]">{i + 1}</span>
                {x}
              </p>
            ))}
          </>
        )}

        {name === "privacy" && (
          <>
            <h2 className="font-display font-extrabold text-xl">{t("onboarding.privacyT")}</h2>
            <p className="text-sm text-muted -mt-2">{t("onboarding.privacyD")}</p>
            {[
              { label: t("settings.readReceipts"), v: read, set: setRead },
              { label: t("settings.lastSeen"), v: lastSeen, set: setLastSeen },
              { label: t("settings.findable"), v: findable, set: setFindable },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between min-h-[52px]">
                <span className="font-semibold">{r.label}</span>
                <Switch checked={r.v} onChange={r.set} label={r.label} />
              </div>
            ))}
          </>
        )}
      </div>

      <div className="w-full flex gap-2.5 mt-4">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>{t("onboarding.back")}</Button>
        )}
        <button onClick={() => void skip()} className="px-2 text-sm font-semibold text-muted hover:text-ink">
          {t("onboarding.skip")}
        </button>
        <span className="flex-1" />
        {step < total - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>{t("onboarding.next")}</Button>
        ) : (
          <Button
            onClick={() => {
              setProfileLocal({ display_name: displayName });
              setSettingsLocal({ theme, accent, sound_enabled: sound, preview_text: preview, read_receipts: read, show_last_seen: lastSeen, findable_by_username: findable });
              void finish();
            }}
            loading={finishing}
          >
            {t("onboarding.finish")}
          </Button>
        )}
      </div>

      <AvatarEditor open={avatarOpen} onClose={() => setAvatarOpen(false)} onSaved={(path) => setProfileLocal({ avatar_url: path })} />
    </div>
  );
}
