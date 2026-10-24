"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import { useApp } from "@/components/providers";
import { t } from "@/lib/i18n";

/**
 * Atalhos de conta no fim do perfil (no celular não há menu lateral,
 * então é daqui que se chega nas Configurações e no Sair/trocar de conta).
 */
export function AccountActions() {
  const { signOut } = useApp();
  return (
    <div className="max-w-xl mx-auto w-full px-4 tablet:px-6 pb-28 tablet:pb-10 flex flex-col gap-2.5">
      <Link href="/config">
        <Button variant="secondary" icon="sliders" className="w-full">
          {t("nav.settings")}
        </Button>
      </Link>
      <Button variant="secondary" icon="logout" onClick={() => void signOut()} className="w-full">
        <span className="text-danger">{t("nav.logout")}</span>
      </Button>
    </div>
  );
}
