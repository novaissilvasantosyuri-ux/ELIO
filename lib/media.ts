"use client";

/**
 * ELIO — helpers de mídia (Fase 2B): compressão, recorte, gravação de voz e formatos.
 * Tudo roda no navegador; o servidor valida tudo de novo (tipo, tamanho, mime).
 */

export type MediaKind = "image" | "video" | "audio" | "file";

const IMAGE_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_OK = ["video/mp4", "video/webm"];
const AUDIO_OK = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"];
const FILE_OK = [
  "application/pdf", "text/plain", "text/markdown", "text/csv",
  "application/zip", "application/x-rar-compressed", "application/x-7z-compressed",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

/** Limites (iguais aos do servidor). */
export const MEDIA_LIMITS: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

/** Classifica o arquivo pelo mime (null = não suportado). */
export function fileKind(mime: string): MediaKind | null {
  // o gravador gera "audio/webm;codecs=opus": ignora parâmetros
  const base = (mime.split(";")[0] ?? "").trim().toLowerCase();
  if (IMAGE_OK.includes(base)) return "image";
  if (VIDEO_OK.includes(base)) return "video";
  if (AUDIO_OK.includes(base)) return "audio";
  if (FILE_OK.includes(base)) return "file";
  return null;
}

export function acceptFor(kind: MediaKind | "any"): string {
  if (kind === "image") return IMAGE_OK.join(",");
  if (kind === "video") return VIDEO_OK.join(",");
  if (kind === "audio") return AUDIO_OK.join(",");
  return [...IMAGE_OK, ...VIDEO_OK, ...AUDIO_OK, ...FILE_OK].join(",");
}

/** "1,2 MB" / "340 KB" */
export function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(".", ",")} MB`;
}

/** 65 → "1:05" */
export function fmtDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return "";
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Abre o seletor de arquivo e devolve o escolhido (ou null). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Comprime a foto (máx. 1600px, WebP ~82%). GIF passa direto (animado).
 * Devolve o blob pronto + dimensões reais.
 */
export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number; name: string }> {
  if (file.type === "image/gif") {
    const img = await loadImage(file);
    return { blob: file, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
  }
  const img = await loadImage(file);
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = (await canvasToBlob(canvas, "image/webp", 0.82)) ?? (await canvasToBlob(canvas, "image/jpeg", 0.85));
  if (!blob) throw new Error("encode");
  const base = (file.name.split("/").pop() ?? "foto").replace(/\.[a-z0-9]+$/i, "") || "foto";
  return { blob, width, height, name: `${base}.webp` };
}

/** Recorte quadrado central (foto do grupo, 512px WebP). */
export async function squareCrop(file: File, size = 512): Promise<Blob> {
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = Math.round((img.naturalWidth - side) / 2);
  const sy = Math.round((img.naturalHeight - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const blob = (await canvasToBlob(canvas, "image/webp", 0.85)) ?? (await canvasToBlob(canvas, "image/jpeg", 0.9));
  if (!blob) throw new Error("encode");
  return blob;
}

/** Duração de um áudio/vídeo (segundos, arredondado). */
export function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? Math.round(el.duration) : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("probe"));
    };
    el.src = url;
  });
}

/* ---------- gravador de voz ---------- */

export interface VoiceRecording {
  blob: Blob;
  duration: number;
}

function pickRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    try {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* tenta o próximo */
    }
  }
  return "";
}

/**
 * Grava áudio do microfone. start() pede permissão; stop() devolve o blob.
 * Lança Error("mic-denied") se o usuário negar, Error("mic-busy") se já gravando.
 */
export function createVoiceRecorder() {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;

  const cleanup = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    recorder = null;
    chunks = [];
  };

  return {
    get active() {
      return recorder !== null;
    },
    async start(): Promise<void> {
      if (recorder) throw new Error("mic-busy");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error("mic-denied");
      }
      chunks = [];
      const mime = pickRecorderMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      startedAt = Date.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start(250);
    },
    stop(): Promise<VoiceRecording> {
      const rec = recorder;
      if (!rec) throw new Error("mic-idle");
      return new Promise((resolve, reject) => {
        rec.onstop = () => {
          const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          cleanup();
          if (blob.size === 0) reject(new Error("mic-empty"));
          else resolve({ blob, duration });
        };
        rec.onerror = () => {
          cleanup();
          reject(new Error("mic-error"));
        };
        rec.stop();
      });
    },
    cancel(): void {
      try {
        recorder?.stop();
      } catch {
        /* ok */
      }
      cleanup();
    },
  };
}
