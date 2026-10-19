"use client";

/**
 * Papel de parede: gradientes, cores, imagem própria + desfoque/escurecimento.
 * Vale para todas as conversas ou só uma.
 */
import React, { useRef, useState } from "react";
import { Button, Icon, Modal, Spinner } from "@/components/ui";
import { useApp, useToast } from "@/components/providers";
import { supabaseBrowser } from "@/lib/supabase/client";
import { containCompress, randomName, storageUrl, validateImageFile, WALLPAPER_MAX_MB } from "@/lib/images";
import { WALL_GRADIENTS, WALL_SOLIDS, friendlyError, wallpaperOverlay, wallpaperStyle, type WallpaperValue } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface WallpaperSetting {
  value: WallpaperValue;
  blur: number;
  dim: number;
}

export function WallpaperPicker({
  value, onChange,
}: { value: WallpaperSetting; onChange: (w: WallpaperSetting) => void }) {
  const { toast } = useToast();
  const { user } = useApp();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (f: File | undefined) => {
    if (!f || !user) return;
    const err = validateImageFile(f, WALLPAPER_MAX_MB);
    if (err) {
      toast(err, "error");
      return;
    }
    setUploading(true);
    try {
      const blob = await containCompress(f, 1920);
      const path = `${user.id}/${randomName()}`;
      const { error } = await supabaseBrowser().storage.from("wallpapers").upload(path, blob, {
        contentType: "image/webp",
        upsert: false,
      });
      if (error) throw new Error("Não foi possível enviar. Tente de novo.");
      onChange({ ...value, value: { kind: "image", url: path } });
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setUploading(false);
    }
  };

  const v = value.value;
  const isDefault = v.kind === "default";

  return (
    <div className="flex flex-col gap-4">
      {/* prévia */}
      <div className="relative h-44 rounded-2xl overflow-hidden border border-line chat-wallpaper" style={wallpaperStyle(v, 0, 0)}>
        <div className="absolute inset-0" style={wallpaperOverlay(value.blur, value.dim)} />
        <div className="absolute inset-0 p-4 flex flex-col justify-end gap-1.5">
          <span className="self-start px-3 py-1.5 rounded-2xl rounded-bl-md bg-bubble text-ink text-[13px] shadow">Oi! Tudo bem? 👋</span>
          <span className="self-end px-3 py-1.5 rounded-2xl rounded-br-md bg-gradient-to-br from-sent-from to-sent-to text-white text-[13px] shadow">Tudo ótimo! 💜</span>
        </div>
      </div>

      <div>
        <p className="text-sm font-bold mb-2">{t("settings.wallNone")} · {t("settings.wallGradients")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onChange({ ...value, value: { kind: "default" } })}
            className={cn(
              "h-14 w-14 rounded-2xl border-2 bg-surface2 text-[11px] font-bold text-muted",
              isDefault ? "border-[var(--brand)]" : "border-line",
            )}
          >
            Padrão
          </button>
          {WALL_GRADIENTS.map((g) => (
            <button
              key={g.id} onClick={() => onChange({ ...value, value: { kind: "gradient", id: g.id } })}
              aria-label={g.id}
              className={cn("h-14 w-14 rounded-2xl border-2", v.kind === "gradient" && v.id === g.id ? "border-ink scale-105" : "border-transparent")}
              style={{ background: g.css }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-bold mb-2">{t("settings.wallSolid")}</p>
        <div className="flex flex-wrap gap-2">
          {WALL_SOLIDS.map((c) => (
            <button
              key={c} onClick={() => onChange({ ...value, value: { kind: "solid", color: c } })}
              aria-label={c}
              className={cn("h-14 w-14 rounded-2xl border-2", v.kind === "solid" && v.color === c ? "border-ink scale-105" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-bold mb-2">{t("settings.wallMine")}</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon="image" onClick={() => fileRef.current?.click()} loading={uploading}>
            {t("settings.wallUpload")}
          </Button>
          {v.kind === "image" && (
            <span className="text-xs text-muted truncate max-w-48">Imagem enviada ✓</span>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
        {v.kind === "image" && v.url && (
          <div className="mt-2 h-16 w-28 rounded-xl border border-line bg-cover bg-center" style={{ backgroundImage: `url("${storageUrl("wallpapers", v.url)}")` }} />
        )}
      </div>

      {!isDefault && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 text-sm font-medium">
            <span className="w-24">{t("settings.wallBlur")}</span>
            <input type="range" min={0} max={20} value={value.blur} onChange={(e) => onChange({ ...value, blur: Number(e.target.value) })} className="elio-range flex-1" />
            <span className="w-10 text-right text-muted">{value.blur}</span>
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <span className="w-24">{t("settings.wallDim")}</span>
            <input type="range" min={0} max={70} value={value.dim} onChange={(e) => onChange({ ...value, dim: Number(e.target.value) })} className="elio-range flex-1" />
            <span className="w-10 text-right text-muted">{value.dim}%</span>
          </label>
        </div>
      )}
    </div>
  );
}

export function WallpaperModal({
  scope, conversationId, initial, onClose,
}: {
  scope: "global" | "conversation";
  conversationId?: string;
  initial?: WallpaperSetting;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { settings, setSettingsLocal } = useApp();
  const [draft, setDraft] = useState<WallpaperSetting>(
    initial ?? settings?.wallpaper ?? { value: { kind: "default" }, blur: 0, dim: 0 },
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (scope === "global") {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallpaper: draft }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error);
        setSettingsLocal({ wallpaper: draft });
      } else if (conversationId) {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallpaper: draft }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error);
      }
      toast(t("settings.saved"), "ok");
      onClose();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const resetConv = async () => {
    if (scope !== "conversation" || !conversationId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallpaper: null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast(t("settings.saved"), "ok");
      onClose();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("settings.wallpaper")} wide>
      {scope === "global" ? (
        <p className="text-sm text-muted mb-3">{t("settings.wallpaperGlobal")}</p>
      ) : (
        <p className="text-sm text-muted mb-3">Só para esta conversa (o global continua nas outras).</p>
      )}
      <WallpaperPicker value={draft} onChange={setDraft} />
      <div className="flex gap-2.5 mt-5">
        {scope === "conversation" && (
          <Button variant="ghost" full onClick={() => void resetConv()} loading={saving}>
            Usar o global
          </Button>
        )}
        <Button variant="secondary" full onClick={onClose}>{t("conversations.cancel")}</Button>
        <Button full onClick={() => void save()} loading={saving}>
          {saving ? <Spinner size={18} /> : t("profile.saveBtn")}
        </Button>
      </div>
      {scope === "global" && (
        <p className="text-xs text-muted mt-3 flex items-center gap-1.5">
          <Icon name="info" size={14} /> {t("settings.wallpaperPerChat")}
        </p>
      )}
    </Modal>
  );
}
