"use client";

/**
 * Seções de Configurações: aparência, notificações, privacidade e conta.
 * Tudo salva na hora (conta, sincronizado entre aparelhos).
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Icon, Segmented, SoonBadge, Switch } from "@/components/ui";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client";
import { useApp, useToast } from "@/components/providers";
import { supabaseBrowser } from "@/lib/supabase/client";
import { WallpaperModal } from "@/components/settings/WallpaperPicker";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/lib/supabase/types";

const ACCENTS = [
  { id: "#4B1FB0", label: "Violeta Elio" },
  { id: "#4C6FFF", label: "Azul" },
  { id: "#0E9F8A", label: "Verde" },
  { id: "#C2255C", label: "Rosa" },
  { id: "#B25E09", label: "Laranja" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft flex flex-col gap-4">
      <h2 className="font-display font-extrabold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, desc, control }: { label: string; desc?: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 min-h-[52px]">
      <div className="min-w-0">
        <p className="font-semibold text-[15px]">{label}</p>
        {desc && <p className="text-[13px] text-muted mt-0.5">{desc}</p>}
      </div>
      <span className="shrink-0">{control}</span>
    </div>
  );
}

export function useSaveSettings() {
  const { toast } = useToast();
  const { setSettingsLocal } = useApp();
  const [saving, setSaving] = useState(false);
  const save = async (patch: Partial<UserSettings>) => {
    setSettingsLocal(patch); // otimista: troca na hora, sem recarregar
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

export function AppearanceSettings() {
  const { settings } = useApp();
  const { save } = useSaveSettings();
  const [wallOpen, setWallOpen] = useState(false);
  if (!settings) return null;
  const s = settings;

  return (
    <Section title={t("settings.appearance")}>
      <div>
        <p className="font-semibold text-[15px] mb-2">{t("settings.theme")}</p>
        <Segmented
          ariaLabel={t("settings.theme")} value={s.theme} onChange={(v) => void save({ theme: v })}
          options={[
            { value: "light", label: t("settings.light"), icon: "sun" },
            { value: "dark", label: t("settings.dark"), icon: "moon" },
            { value: "auto", label: t("settings.auto"), icon: "auto" },
          ]}
        />
        {s.theme === "auto" && <p className="text-[13px] text-muted mt-1.5">{t("settings.autoDesc")}</p>}
      </div>
      <div>
        <p className="font-semibold text-[15px] mb-2">{t("settings.accent")}</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id} title={a.label} aria-label={a.label} onClick={() => void save({ accent: a.id })}
              className={cn("h-11 px-4 rounded-2xl text-sm font-bold text-white", s.accent === a.id && "ring-[3px] ring-ink ring-offset-2 ring-offset-[var(--surface)]")}
              style={{ background: a.id }}
            >
              {s.accent === a.id ? "✓" : a.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="font-semibold text-[15px] mb-2">{t("settings.fontSize")}</p>
        <Segmented
          ariaLabel={t("settings.fontSize")} value={s.font_size} onChange={(v) => void save({ font_size: v })}
          options={[
            { value: "sm", label: t("settings.fontS") },
            { value: "md", label: t("settings.fontM") },
            { value: "lg", label: t("settings.fontG") },
          ]}
        />
      </div>
      <div>
        <p className="font-semibold text-[15px] mb-2">{t("settings.density")}</p>
        <Segmented
          ariaLabel={t("settings.density")} value={s.density} onChange={(v) => void save({ density: v })}
          options={[
            { value: "comfortable", label: t("settings.comfortable") },
            { value: "compact", label: t("settings.compact") },
          ]}
        />
      </div>
      <Row label={t("settings.reduceMotion")} control={<Switch checked={s.reduce_motion} onChange={(v) => void save({ reduce_motion: v })} label={t("settings.reduceMotion")} />} />
      <Row
        label={t("settings.wallpaper")} desc={t("settings.wallpaperGlobal")}
        control={<Button variant="secondary" size="sm" onClick={() => setWallOpen(true)} icon="image">Escolher</Button>}
      />
      {wallOpen && <WallpaperModal scope="global" onClose={() => setWallOpen(false)} />}
    </Section>
  );
}

export function NotificationSettings() {
  const { settings } = useApp();
  const { toast } = useToast();
  const { save } = useSaveSettings();
  const [push, setPush] = useState<PushState>("off");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void getPushState().then(setPush);
  }, []);

  async function togglePush(on: boolean) {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (!on) {
        await disablePush();
        setPush("off");
        toast(t("settings.pushOff"), "ok");
        return;
      }
      const next = await enablePush();
      setPush(next === "subscribed" ? "subscribed" : next === "denied" ? push : "off");
      if (next === "subscribed") toast(t("settings.pushOn"), "ok");
      else if (next === "denied") toast(t("settings.pushDenied"), "error");
      else if (next === "unsupported") toast(t("settings.pushUnsupported"), "error");
      else if (next === "unconfigured") toast(t("settings.pushUnconfigured"), "error");
      else toast(t("errors.generic"), "error");
    } finally {
      setPushBusy(false);
    }
  }

  if (!settings) return null;
  return (
    <Section title={t("settings.notifications")}>
      <Row label={t("settings.sound")} control={<Switch checked={settings.sound_enabled} onChange={(v) => void save({ sound_enabled: v })} label={t("settings.sound")} />} />
      <Row label={t("settings.preview")} control={<Switch checked={settings.preview_text} onChange={(v) => void save({ preview_text: v })} label={t("settings.preview")} />} />
      <Row
        label={t("settings.push")}
        desc={t("settings.pushDesc")}
        control={
          <Switch
            checked={push === "subscribed"}
            onChange={(v) => void togglePush(v)}
            label={t("settings.push")}
          />
        }
      />
    </Section>
  );
}

export function PrivacySettings() {
  const { settings } = useApp();
  const { save } = useSaveSettings();
  if (!settings) return null;
  const s = settings;
  return (
    <Section title={t("settings.privacy")}>
      <Row
        label={t("settings.readReceipts")} desc={t("settings.readReceiptsDesc")}
        control={<Switch checked={s.read_receipts} onChange={(v) => void save({ read_receipts: v })} label={t("settings.readReceipts")} />}
      />
      <Row
        label={t("settings.typing")}
        control={<Switch checked={s.typing_indicators} onChange={(v) => void save({ typing_indicators: v })} label={t("settings.typing")} />}
      />
      <Row
        label={t("settings.lastSeen")}
        control={<Switch checked={s.show_last_seen} onChange={(v) => void save({ show_last_seen: v })} label={t("settings.lastSeen")} />}
      />
      <Row
        label={t("settings.findable")}
        control={<Switch checked={s.findable_by_username} onChange={(v) => void save({ findable_by_username: v })} label={t("settings.findable")} />}
      />
      <div>
        <p className="font-semibold text-[15px] mb-2">{t("settings.messagesFrom")}</p>
        <Segmented
          ariaLabel={t("settings.messagesFrom")} value={s.messages_from} onChange={(v) => void save({ messages_from: v })}
          options={[
            { value: "everyone", label: t("settings.everyone") },
            { value: "contacts", label: t("settings.contactsOnly") },
            { value: "nobody", label: t("settings.nobody") },
          ]}
        />
      </div>
    </Section>
  );
}

export function AccountSettings() {
  const { toast } = useToast();
  const { user } = useApp();
  const [sending, setSending] = useState(false);

  const sendReset = async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) throw error;
      toast(t("auth.forgotSent"), "ok");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Section title={t("settings.account")}>
      <Row
        label={t("settings.changePassword")} desc={t("settings.changePasswordDesc")}
        control={<Button variant="secondary" size="sm" onClick={() => void sendReset()} loading={sending}>Enviar link</Button>}
      />
      <p className="text-[13px] text-muted flex items-center gap-2">
        <Icon name="shield" size={15} /> <SoonBadge /> {t("settings.sessionsSoon")}
      </p>
      <p className="text-[13px] text-muted flex items-center gap-2">
        <Icon name="download" size={15} /> <SoonBadge /> {t("settings.exportSoon")}
      </p>
    </Section>
  );
}

export function AboutSettings() {
  return (
    <Section title={t("settings.app")}>
      <div className="flex flex-col gap-1 text-[15px]">
        <Link href="/legal/termos" className="font-semibold text-brand py-2">{t("settings.terms")}</Link>
        <Link href="/legal/privacidade" className="font-semibold text-brand py-2">{t("settings.privacyPolicy")}</Link>
        <p className="text-[13px] text-muted pt-1">{t("settings.version", { v: "0.1.0 — Fase 1" })}</p>
      </div>
    </Section>
  );
}
