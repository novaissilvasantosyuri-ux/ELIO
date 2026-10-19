"use client";

import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * Marca Elio em SVG: quadrado bem arredondado com brilho roxo (esq.)
 * e azul-claro (dir.), dois círculos vazados ligados por haste curva.
 */
export function ElioMark({ size = 40, className }: { size?: number; className?: string }) {
  const gid = `g${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden="true">
      <defs>
        <radialGradient id={`${gid}a`} cx="0%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity=".55" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}b`} cx="100%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#7DD3FC" stopOpacity=".6" />
          <stop offset="100%" stopColor="#7DD3FC" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="20" fill="#F5F2FB" />
      <rect x="2" y="2" width="60" height="60" rx="20" fill={`url(#${gid}a)`} />
      <rect x="2" y="2" width="60" height="60" rx="20" fill={`url(#${gid}b)`} />
      {/* haste curva */}
      <path d="M24 40 C 28 28, 36 28, 40 24" fill="none" stroke="#2E0F6B" strokeWidth="4.5" strokeLinecap="round" />
      {/* dois círculos vazados */}
      <circle cx="21" cy="41" r="7.5" fill="#F5F2FB" stroke="#2E0F6B" strokeWidth="4.5" />
      <circle cx="43" cy="23" r="7.5" fill="#F5F2FB" stroke="#2E0F6B" strokeWidth="4.5" />
    </svg>
  );
}

/** Logotipo completo: ícone + "elio" + slogan. */
export function ElioLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ElioMark size={compact ? 32 : 40} />
      <span className="flex flex-col leading-none">
        <span className="font-display font-extrabold lowercase text-[var(--brand-deep)] text-2xl tracking-tight">
          {t("brand.name")}
        </span>
        {!compact && (
          <span className="text-[9px] font-bold tracking-[0.22em] text-[var(--brand)] mt-1">
            {t("brand.slogan")}
          </span>
        )}
      </span>
    </span>
  );
}
