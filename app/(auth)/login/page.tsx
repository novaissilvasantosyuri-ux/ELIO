"use client";

/** Entrar: e-mail + senha (resposta genérica, sem revelar se o e-mail existe). */
import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Icon, Input } from "@/components/ui";
import { useToast } from "@/components/providers";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** Usa ?next= da URL: sempre renderiza no servidor por requisição. */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/conversas";
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError(t("errors.invalidEmail"));
      return;
    }
    if (!password) {
      setError(t("errors.required"));
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabaseBrowser().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      router.push(next.startsWith("/") ? next : "/conversas");
      router.refresh();
    } catch (err) {
      const msg = friendlyError(err);
      // genérica de propósito (não revela se o e-mail existe)
      setError(msg === t("errors.invalidLogin") ? msg : t("errors.invalidLogin"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="font-display font-extrabold text-2xl">{t("auth.loginTitle")}</h1>
        <p className="text-muted mt-1">{t("auth.loginSub")}</p>
      </div>
      <Field label={t("auth.email")}>
        <Input
          type="email" autoComplete="email" placeholder={t("auth.emailPh")}
          value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
        />
      </Field>
      <Field label={t("auth.password")}>
        <div className="relative">
          <Input
            type={show ? "text" : "password"} autoComplete="current-password"
            placeholder={t("auth.passwordPh")}
            value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12"
          />
          <button
            type="button" onClick={() => setShow((s) => !s)}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:bg-surface2"
          >
            <Icon name={show ? "eye" : "lock"} size={18} />
          </button>
        </div>
      </Field>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button type="submit" full loading={loading}>{t("auth.loginBtn")}</Button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot" className="font-semibold text-brand">{t("auth.forgot")}</Link>
        <Link href="/register" className="font-semibold text-brand">{t("auth.toRegister")}</Link>
      </div>
    </form>
  );
}
