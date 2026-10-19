"use client";

/** Nova senha (chega-se aqui pelo link do e-mail, com sessão temporária). */
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";

export default function ResetPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("errors.weakPassword"));
      return;
    }
    if (password !== confirm) {
      setError(t("errors.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabaseBrowser().auth.updateUser({ password });
      if (err) throw err;
      router.push("/login");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="font-display font-extrabold text-2xl">{t("auth.resetTitle")}</h1>
        <p className="text-muted mt-1">{t("auth.resetDesc")}</p>
      </div>
      <Field label={t("auth.password")}>
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.passwordPh")} autoFocus />
      </Field>
      <Field label={t("auth.passwordConfirm")}>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button type="submit" full loading={loading}>{t("auth.resetBtn")}</Button>
      <p className="text-sm text-center">
        <Link href="/login" className="font-semibold text-brand">{t("auth.backToLogin")}</Link>
      </p>
    </form>
  );
}
