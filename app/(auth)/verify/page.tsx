"use client";

/** Aviso de confirmação de e-mail + reenviar. */
import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Icon } from "@/components/ui";
import { useToast } from "@/components/providers";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** Usa ?email= da URL: sempre renderiza no servidor por requisição. */
export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyBody />
    </Suspense>
  );
}

function VerifyBody() {
  const email = useSearchParams().get("email") ?? "";
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      const { error } = await supabaseBrowser().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
      });
      if (error) throw error;
      toast(t("auth.resent"), "ok");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-center items-center">
      <span className="w-16 h-16 rounded-3xl bg-brand-soft text-brand inline-flex items-center justify-center">
        <Icon name="send" size={30} />
      </span>
      <div>
        <h1 className="font-display font-extrabold text-2xl">{t("auth.verifyTitle")}</h1>
        <p className="text-muted mt-1">{t("auth.verifyDesc", { email: email || "seu e-mail" })}</p>
      </div>
      <Button full onClick={() => void resend()} loading={sending} disabled={!email}>
        {t("auth.resend")}
      </Button>
      <p className="text-sm">
        <Link href="/login" className="font-semibold text-brand">{t("auth.backToLogin")}</Link>
      </p>
    </div>
  );
}
