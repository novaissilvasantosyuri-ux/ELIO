"use client";

/**
 * Barra de entrada: anexo (foto/vídeo/voz/arquivo), emoji, campo, enviar e voz.
 * Enter envia · Shift+Enter quebra linha.
 */
import React, { useEffect, useRef, useState } from "react";
import { Icon, IconButton, Modal } from "@/components/ui";
import { useToast } from "@/components/providers";
import { useTypingSender, type OptimisticMsg } from "@/lib/chat-hooks";
import { cn, friendlyError, uid } from "@/lib/utils";
import {
  acceptFor, compressImage, createVoiceRecorder, fileKind, fmtDuration, fmtSize,
  MEDIA_LIMITS, pickFile, probeDuration, type MediaKind,
} from "@/lib/media";
import { t } from "@/lib/i18n";

const EMOJIS = (
  "😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😅 😭 😡 😴 🤯 🥳 😇 🤝 👏 🙏 💪 " +
  "👍 👎 👌 ✌️ 🤞 🖐️ 👋 🎉 🎂 ❤️ 💔 💜 💯 ✨ 🔥 ⭐ 🌙 ☀️ 🌈 " +
  "☕ 🍕 🎵 🎬 ⚽ 🚗 ✈️ 🏠 📚 💼 🎁 📎 📌 ✅ ❌ ❓ ❗ 💡 📞 📷"
).split(" ");

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("elio-recent-emoji") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const pick = (e: string) => {
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 12);
    setRecent(next);
    try {
      localStorage.setItem("elio-recent-emoji", JSON.stringify(next));
    } catch { /* ok */ }
    onPick(e);
  };
  return (
    <Modal open onClose={onClose} title={t("chat.emojiTitle")}>
      {recent.length > 0 && (
        <>
          <p className="text-xs font-bold text-muted mb-2">Recentes</p>
          <div className="grid grid-cols-8 gap-1 mb-3">
            {recent.map((e) => (
              <button key={`r${e}`} onClick={() => pick(e)} className="h-11 text-2xl rounded-xl hover:bg-surface2" aria-label={e}>{e}</button>
            ))}
          </div>
        </>
      )}
      <div className="grid grid-cols-8 gap-1">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => pick(e)} className="h-11 text-2xl rounded-xl hover:bg-surface2" aria-label={e}>{e}</button>
        ))}
      </div>
    </Modal>
  );
}

interface Preview {
  blob: Blob;
  name: string;
  kind: MediaKind;
  url: string;
  width?: number;
  height?: number;
  duration?: number;
}

interface Props {
  conversationId: string;
  disabled?: boolean;
  disabledReason?: string | null;
  replyTo: OptimisticMsg | null;
  onCancelReply: () => void;
  onSend: (body: string, replyToId: string | null) => Promise<void>;
  /** Chamado após mídia enviada (para buscar as últimas + rolar). */
  onMediaSent: () => Promise<void>;
  sending: boolean;
  typingEnabled: boolean;
  /** Fase 5: esconde anexo e microfone (a IA só conversa por texto). */
  noMedia?: boolean;
}

const ATTACH_OPTIONS: Array<{ kind: MediaKind; icon: "camera" | "video" | "sound" | "download"; label: string }> = [
  { kind: "image", icon: "camera", label: t("media.attachPhoto") },
  { kind: "video", icon: "video", label: t("media.attachVideo") },
  { kind: "audio", icon: "sound", label: t("media.attachVoice") },
  { kind: "file", icon: "download", label: t("media.attachFile") },
];

export function Composer({
  conversationId, disabled, disabledReason, replyTo, onCancelReply, onSend, onMediaSent, sending, typingEnabled, noMedia,
}: Props) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<ReturnType<typeof createVoiceRecorder> | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewRef = useRef<Preview | null>(null);
  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);
  const { poke, stop } = useTypingSender(conversationId, typingEnabled && !disabled);

  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  // limpa URL temporária + gravação ao desmontar
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current.url);
      try {
        recorderRef.current?.cancel();
      } catch { /* ok */ }
      if (recTimer.current) clearInterval(recTimer.current);
    };
  }, []);

  const submit = () => {
    const v = text.trim();
    if (!v || disabled || sending) return;
    if (v.length > 4000) {
      toast(t("errors.messageLong"), "error");
      return;
    }
    stop();
    void onSend(v, replyTo?.id ?? null).then(() => {
      setText("");
      onCancelReply();
      requestAnimationFrame(() => taRef.current?.focus());
    });
  };

  const insertEmoji = (e: string) => {
    const ta = taRef.current;
    if (!ta) {
      setText((v) => v + e);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + e.length;
    });
  };

  const clearPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setCaption("");
  };

  const chooseFile = async (want: MediaKind) => {
    setAttachOpen(false);
    if (disabled) return;
    if (!navigator.onLine) {
      toast(t("media.offline"), "error");
      return;
    }
    const file = await pickFile(acceptFor(want));
    if (!file) return;
    const kind = fileKind(file.type);
    if (!kind || (want !== "file" && kind !== want) || (want === "file" && kind !== "file")) {
      toast(t("media.unsupported"), "error");
      return;
    }
    if (file.size > MEDIA_LIMITS[kind]) {
      toast(t("media.tooBig", { max: fmtSize(MEDIA_LIMITS[kind]) }), "error");
      return;
    }
    try {
      if (kind === "image") {
        const c = await compressImage(file);
        if (c.blob.size > MEDIA_LIMITS.image) {
          toast(t("media.tooBig", { max: fmtSize(MEDIA_LIMITS.image) }), "error");
          return;
        }
        clearPreview();
        setPreview({ blob: c.blob, name: c.name, kind, url: URL.createObjectURL(c.blob), width: c.width, height: c.height });
      } else if (kind === "video" || kind === "audio") {
        const duration = await probeDuration(file).catch(() => 0);
        clearPreview();
        setPreview({
          blob: file, name: file.name, kind, url: URL.createObjectURL(file),
          duration: duration > 0 ? duration : undefined,
        });
      } else {
        clearPreview();
        setPreview({ blob: file, name: file.name, kind, url: URL.createObjectURL(file) });
      }
    } catch {
      toast(t("errors.generic"), "error");
    }
  };

  const sendMedia = async () => {
    if (!preview || uploading || disabled) return;
    if (!navigator.onLine) {
      toast(t("media.offline"), "error");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("conversation_id", conversationId);
      form.set("client_id", uid());
      if (replyTo) form.set("reply_to_id", replyTo.id);
      if (caption.trim()) form.set("caption", caption.trim().slice(0, 1000));
      if (preview.width) form.set("width", String(preview.width));
      if (preview.height) form.set("height", String(preview.height));
      if (preview.duration) form.set("duration_s", String(preview.duration));
      form.set("file", preview.blob, preview.name);
      const res = await fetch("/api/media", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      clearPreview();
      onCancelReply();
      await onMediaSent();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    if (disabled || recording) return;
    if (!navigator.onLine) {
      toast(t("media.offline"), "error");
      return;
    }
    const rec = createVoiceRecorder();
    recorderRef.current = rec;
    try {
      await rec.start();
    } catch (e) {
      recorderRef.current = null;
      toast(e instanceof Error && e.message === "mic-denied" ? t("media.recDenied") : t("errors.generic"), "error");
      return;
    }
    setRecording(true);
    setRecSeconds(0);
    recTimer.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
  };

  const finishRecording = async (send: boolean) => {
    const rec = recorderRef.current;
    if (recTimer.current) clearInterval(recTimer.current);
    recTimer.current = null;
    setRecording(false);
    recorderRef.current = null;
    if (!rec) return;
    if (!send) {
      rec.cancel();
      return;
    }
    try {
      const { blob, duration } = await rec.stop();
      if (blob.size > MEDIA_LIMITS.audio) {
        toast(t("media.tooBig", { max: fmtSize(MEDIA_LIMITS.audio) }), "error");
        return;
      }
      clearPreview();
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      setPreview({
        blob, name: `audio.${ext}`, kind: "audio",
        url: URL.createObjectURL(blob), duration,
      });
    } catch {
      toast(t("errors.generic"), "error");
    }
  };

  return (
    <div className="shrink-0 px-3 tablet:px-5 pb-3 tablet:pb-4 pt-1">
      {replyTo && (
        <div className="anim-fade-up flex items-center gap-2 mb-1.5 ml-1 mr-1 px-3 py-2 rounded-2xl bg-surface border border-line shadow-sm">
          <span className="w-1 self-stretch rounded-full bg-[var(--brand)]" />
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-bold text-[var(--brand)]">
              {t("chat.replyingTo", { name: replyTo.sender_name })}
            </span>
            <span className="block text-[13px] text-muted truncate">{replyTo.body}</span>
          </span>
          <button onClick={onCancelReply} aria-label={t("a11y.close")} className="p-2 rounded-lg text-muted hover:bg-surface2">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {disabledReason && (
        <p className="text-center text-[13px] text-muted bg-surface2/80 rounded-2xl px-4 py-2.5 mb-1.5" role="status">
          {disabledReason}
        </p>
      )}

      {/* prévia do anexo */}
      {preview && (
        <div className="anim-fade-up mb-1.5 mx-1 rounded-2xl bg-surface border border-line shadow-sm p-3">
          <div className="flex items-center gap-3">
            {preview.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" draggable={false} className="w-16 h-16 rounded-xl object-cover shrink-0" />
            ) : (
              <span className="w-16 h-16 rounded-xl bg-surface2 inline-flex items-center justify-center shrink-0">
                <Icon name={preview.kind === "video" ? "video" : preview.kind === "audio" ? "sound" : "download"} size={26} className="text-muted" />
              </span>
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold truncate">{preview.name}</span>
              <span className="block text-[12px] text-muted">
                {fmtSize(preview.blob.size)}
                {preview.duration ? ` · ${fmtDuration(preview.duration)}` : ""}
              </span>
            </span>
            <button onClick={clearPreview} aria-label={t("a11y.close")} className="p-2 rounded-lg text-muted hover:bg-surface2 shrink-0">
              <Icon name="x" size={17} />
            </button>
          </div>
          {preview.kind !== "file" && (
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={1000}
              placeholder={t("media.captionPh")}
              aria-label={t("media.captionPh")}
              className="mt-2.5 w-full h-10 px-3.5 rounded-xl bg-surface2 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--brand)]"
            />
          )}
          <button
            onClick={() => void sendMedia()}
            disabled={uploading}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-2 h-11 rounded-2xl bg-gradient-to-r from-[var(--brand-deep)] to-[var(--brand)] text-white text-[15px] font-semibold disabled:opacity-60"
          >
            {uploading ? (
              <span className="w-5 h-5 rounded-full border-2 border-white/50 border-t-white animate-spin" />
            ) : (
              <Icon name="send" size={18} />
            )}
            {uploading ? t("media.sending") : t("media.send")}
          </button>
        </div>
      )}

      {/* barra principal */}
      {recording ? (
        <div className="flex items-center gap-2 rounded-[28px] bg-surface border border-line shadow-soft px-2 py-2">
          <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse ml-2 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-[15px] font-semibold" role="status">
            {t("media.recording", { t: fmtDuration(recSeconds) })}
          </span>
          <button
            onClick={() => void finishRecording(false)}
            className="h-10 px-4 rounded-full bg-surface2 text-sm font-semibold"
          >
            {t("media.recCancel")}
          </button>
          <button
            onClick={() => void finishRecording(true)}
            aria-label={t("media.recStop")}
            className="inline-flex items-center justify-center w-11 h-11 rounded-full text-white bg-gradient-to-br from-sent-from to-sent-to"
          >
            <Icon name="stop" size={18} />
          </button>
        </div>
      ) : (
        <div className={cn("flex items-end gap-1.5 rounded-[28px] bg-surface border border-line shadow-soft px-1.5 py-1.5", disabled && "opacity-70")}>
          {!noMedia && (
            <IconButton
              label={t("chat.attachTitle")}
              className="w-10 h-10 rounded-full"
              disabled={disabled}
              onClick={() => setAttachOpen(true)}
            >
              <Icon name="plus" size={22} />
            </IconButton>
          )}

          <textarea
            ref={taRef}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) poke();
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={noMedia ? t("ia.inputPh") : t("chat.inputPh")}
            rows={1}
            aria-label={noMedia ? t("ia.inputPh") : t("chat.inputPh")}
            className="composer flex-1 bg-transparent outline-none resize-none text-[15px] leading-snug py-2.5 px-1.5 max-h-36 placeholder:text-muted disabled:cursor-not-allowed"
          />

          {text.length > 3500 && (
            <span className={cn("text-[11px] font-bold pb-3", text.length > 4000 ? "text-danger" : "text-muted")}>
              {text.length}/4000
            </span>
          )}

          <IconButton
            label={t("chat.emojiTitle")}
            className="w-10 h-10 rounded-full"
            disabled={disabled}
            onClick={() => setEmojiOpen(true)}
          >
            <Icon name="emoji" size={22} />
          </IconButton>

          {text.trim() ? (
            <button
              onClick={submit}
              disabled={disabled || sending}
              aria-label={t("chat.send")}
              className="anim-pop inline-flex items-center justify-center w-11 h-11 rounded-full text-white shadow-soft bg-gradient-to-br from-sent-from to-sent-to hover:brightness-105 active:scale-95 transition-all disabled:opacity-60"
            >
              {sending ? (
                <span className="w-5 h-5 rounded-full border-2 border-white/50 border-t-white animate-spin" />
              ) : (
                <Icon name="send" size={19} />
              )}
            </button>
          ) : !noMedia ? (
            <button
              onClick={() => void startRecording()}
              disabled={disabled}
              aria-label={t("media.attachVoice")}
              className="inline-flex items-center justify-center w-11 h-11 rounded-full text-muted hover:text-ink hover:bg-surface2 transition-all disabled:opacity-60"
            >
              <Icon name="mic" size={21} />
            </button>
          ) : null}
        </div>
      )}

      {emojiOpen && (
        <EmojiPicker onPick={(e) => { insertEmoji(e); setEmojiOpen(false); }} onClose={() => setEmojiOpen(false)} />
      )}

      {/* menu de anexo */}
      <Modal open={attachOpen} onClose={() => setAttachOpen(false)} title={t("chat.attachTitle")}>
        <div className="grid grid-cols-2 gap-2.5">
          {ATTACH_OPTIONS.map((o) => (
            <button
              key={o.kind}
              onClick={() => void chooseFile(o.kind)}
              className="flex items-center gap-3 px-4 min-h-[60px] rounded-2xl bg-surface2 hover:bg-[var(--line)] font-semibold text-left"
            >
              <Icon name={o.icon} size={22} className="text-brand" />
              {o.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
