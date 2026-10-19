"use client";

/**
 * Foto de perfil: escolher arquivo ou tirar na hora, recortar em círculo
 * com zoom, exportar 512x512 WebP (sem EXIF) e remover.
 */
import React, { useRef, useState } from "react";
import { Avatar, Button, Icon, Modal, Spinner } from "@/components/ui";
import { useApp, useToast } from "@/components/providers";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  AVATAR_MAX_MB, exportCrop, randomName, storageUrl, validateImageFile,
} from "@/lib/images";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";

const VIEW = 260;

export function AvatarEditor({
  open, onClose, onSaved,
}: { open: boolean; onClose: () => void; onSaved: (path: string | null) => void }) {
  const { toast } = useToast();
  const { user, profile } = useApp();
  const [step, setStep] = useState<"choose" | "crop">("choose");
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("choose");
    setImgEl(null);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const err = validateImageFile(f, AVATAR_MAX_MB);
    if (err) {
      toast(err, "error");
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      setObjectUrl(url);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setStep("crop");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast(t("errors.generic"), "error");
    };
    img.src = url;
  };

  // escala base (cover) x zoom
  const baseScale = imgEl ? Math.max(VIEW / imgEl.naturalWidth, VIEW / imgEl.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const clamp = (x: number, y: number) => {
    if (!imgEl) return { x: 0, y: 0 };
    const mx = Math.max(0, (imgEl.naturalWidth * scale - VIEW) / 2);
    const my = Math.max(0, (imgEl.naturalHeight * scale - VIEW) / 2);
    return {
      x: Math.max(-mx, Math.min(mx, x)),
      y: Math.max(-my, Math.min(my, y)),
    };
  };

  const save = async () => {
    if (!imgEl || !user) return;
    setSaving(true);
    try {
      const blob = await exportCrop(imgEl, VIEW, scale, offset.x, offset.y, 512);
      const path = `${user.id}/${randomName()}`;
      const sb = supabaseBrowser();
      const { error: upErr } = await sb.storage.from("avatars").upload(path, blob, {
        contentType: "image/webp",
        upsert: false,
      });
      if (upErr) throw new Error("Não foi possível enviar. Tente de novo.");
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: path }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast(t("profile.saved"), "ok");
      onSaved(path);
      close();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    setRemoving(true);
    try {
      const old = profile?.avatar_url;
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      if (old && !old.startsWith("http")) {
        await supabaseBrowser().storage.from("avatars").remove([old]).catch(() => {});
      }
      toast(t("profile.saved"), "ok");
      onSaved(null);
      close();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={step === "crop" ? t("profile.adjust") : t("profile.photo")}>
      {step === "choose" && (
        <div className="flex flex-col items-center gap-4">
          <Avatar src={storageUrl("avatars", profile?.avatar_url ?? null)} name={profile?.display_name ?? "?"} size="xl" />
          <div className="grid grid-cols-2 gap-2.5 w-full">
            <Button variant="secondary" icon="image" onClick={() => fileRef.current?.click()}>
              {t("profile.chooseFile")}
            </Button>
            <Button variant="secondary" icon="camera" onClick={() => camRef.current?.click()}>
              {t("profile.takePhoto")}
            </Button>
          </div>
          {profile?.avatar_url && (
            <Button variant="ghost" full onClick={() => void remove()} loading={removing}>
              <span className="text-danger">{t("profile.removePhoto")}</span>
            </Button>
          )}
          <input
            ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])} aria-label={t("profile.chooseFile")}
          />
          <input
            ref={camRef} type="file" accept="image/*" capture="user" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])} aria-label={t("profile.takePhoto")}
          />
        </div>
      )}

      {step === "crop" && imgEl && objectUrl && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted text-center">{t("profile.adjustDesc")}</p>
          <div
            className="relative rounded-full overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing bg-surface2"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              setOffset(clamp(drag.current.ox + (e.clientX - drag.current.x), drag.current.oy + (e.clientY - drag.current.y)));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            role="application"
            aria-label={t("profile.adjust")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl} alt="" draggable={false}
              style={{
                width: imgEl.naturalWidth * scale,
                height: imgEl.naturalHeight * scale,
                transform: `translate(${offset.x + (VIEW - imgEl.naturalWidth * scale) / 2}px, ${offset.y + (VIEW - imgEl.naturalHeight * scale) / 2}px)`,
                maxWidth: "none",
              }}
            />
          </div>
          <div className="w-full flex items-center gap-3">
            <Icon name="image" size={18} className="text-muted" />
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                setOffset((o) => {
                  const s = baseScale * z;
                  const mx = Math.max(0, (imgEl.naturalWidth * s - VIEW) / 2);
                  const my = Math.max(0, (imgEl.naturalHeight * s - VIEW) / 2);
                  return {
                    x: Math.max(-mx, Math.min(mx, o.x)),
                    y: Math.max(-my, Math.min(my, o.y)),
                  };
                });
              }}
              className="elio-range flex-1" aria-label={t("profile.zoom")}
            />
            <span className="text-sm font-bold text-muted w-12 text-right">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="flex gap-2.5 w-full">
            <Button variant="secondary" full onClick={reset}>{t("conversations.cancel")}</Button>
            <Button full onClick={() => void save()} loading={saving}>
              {saving ? <Spinner size={18} /> : t("profile.save")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
