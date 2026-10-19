"use client";

/**
 * Imagens no cliente: validação, recorte e compressão via canvas.
 * Re-encodar no canvas remove metadados EXIF (inclusive GPS) automaticamente.
 */

export const AVATAR_MAX_MB = 5;
export const WALLPAPER_MAX_MB = 8;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateImageFile(file: File, maxMb: number): string | null {
  if (!OK_TYPES.includes(file.type)) return "Use uma imagem JPG, PNG ou WebP.";
  if (file.size > maxMb * 1024 * 1024) return `A imagem precisa ter até ${maxMb} MB.`;
  return null;
}

export function randomName(ext = "webp"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}.${ext}`;
}

/** Resolve o caminho do Storage para URL pública (ou devolve a URL pronta). */
export function storageUrl(bucket: "avatars" | "banners" | "wallpapers", path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const clean = path.startsWith(`${bucket}/`) ? path : `${bucket}/${path}`;
  return `${base}/storage/v1/object/public/${clean}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao processar a imagem."))),
      "image/webp",
      quality,
    );
  });
}

/** Recorta o centro em quadrado e redimensiona (ex.: avatar 512x512). */
export async function squareCover(file: File, size: number, quality = 0.85): Promise<Blob> {
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvasToBlob(c, quality);
}

/** Redimensiona cabendo em maxDim (para banner/wallpaper), sem recortar. */
export async function containCompress(file: File, maxDim: number, quality = 0.82): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvasToBlob(c, quality);
}

/** Exporta o recorte manual do editor (viewport quadrado -> size). */
export async function exportCrop(
  img: HTMLImageElement,
  viewportPx: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  size: number,
  quality = 0.88,
): Promise<Blob> {
  const side = viewportPx / scale;
  const cx = img.naturalWidth / 2 - offsetX / scale;
  const cy = img.naturalHeight / 2 - offsetY / scale;
  const sx = Math.max(0, Math.min(img.naturalWidth - side, cx - side / 2));
  const sy = Math.max(0, Math.min(img.naturalHeight - side, cy - side / 2));
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvasToBlob(c, quality);
}
