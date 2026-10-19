"use client";

/** Esqueci a senha: pede o link (resposta genérica, sem revelar se o e-mail existe). */
import React, { useState } from "react";
import Link from "next/link";
import { Button, Field, Icon, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError(t("errors.invalidEmail"));
      return;
    }
    setLoading(true);
    try {
      await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset`,
      });
      // genérica de propósito: mostra a mesma mensagem exista ou não a conta
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="font-display font-extrabold text-2xl">{t("auth.forgotTitle")}</h1>
        <p className="text-muted mt-1">{t("auth.forgotDesc")}</p>
      </div>
      {sent ? (
        <p className="flex gap-2.5 items-start rounded-2xl bg-surface2 p-4 text-sm leading-relaxed" role="status">
          <Icon name="check" size={18} className="text-[var(--ok)] shrink-0 mt-0.5" />
          {t("auth.forgotSent")}
        </p>
      ) : (
        <>
          <Field label={t("auth.email")}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.emailPh")} autoFocus />
          </Field>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="submit" full loading={loading}>{t("auth.forgotBtn")}</Button>
        </>
      )}
      <p className="text-sm text-center">
        <Link href="/login" className="font-semibold text-brand">{t("auth.backToLogin")}</Link>
      </p>
    </form>
  );
}
