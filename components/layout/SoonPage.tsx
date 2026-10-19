"use client";

/** Página padrão de módulo futuro ("Em breve", atrás de feature flag). */
import React from "react";
import Link from "next/link";
import { Icon, SoonBadge, type IconName } from "@/components/ui";
import { t } from "@/lib/i18n";

export function SoonPage({ icon, title }: { icon: IconName; title: string }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6 py-12 gap-3 anim-fade-up max-w-md mx-auto w-full">
      <span className="w-20 h-20 rounded-[28px] bg-gradient-to-br from-[var(--brand-deep)] to-[var(--accent)] text-white inline-flex items-center justify-center shadow-pop">
        <Icon name={icon} size={38} />
      </span>
      <h1 className="font-display font-extrabold text-2xl mt-2">{title}</h1>
      <SoonBadge />
      <p className="font-semibold">{t("soon.title")}</p>
      <p className="text-sm text-muted leading-relaxed">{t("soon.desc")}</p>
      <Link
        href="/conversas"
        className="mt-3 h-11 px-6 inline-flex items-center rounded-2xl font-semibold text-white bg-gradient-to-r from-[var(--brand-deep)] to-[var(--brand)]"
      >
        {t("soon.action")}
      </Link>
    </div>
  );
}
