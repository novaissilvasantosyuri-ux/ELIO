"use client";

/** Cadastro: e-mail, senha, @usuário, nome, idade + aceite dos termos. */
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field, Icon, Input, Spinner } from "@/components/ui";
import { LegalLinks, TermsModal } from "@/components/legal/Legal";
import { useToast } from "@/components/providers";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useDebouncedCallback } from "@/lib/hooks";
import {
  ageFromBirthdate, friendlyError, minAge, normalizeUsername, validateUsername,
} from "@/lib/utils";
import { t } from "@/lib/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [userState, setUserState] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useDebouncedCallback(async (v: string) => {
    const clean = normalizeUsername(v);
    if (!clean || validateUsername(clean)) {
      setUserState(clean ? "bad" : "idle");
      return;
    }
    setUserState("checking");
    try {
      // verificação pública de disponibilidade (só diz livre/ocupado, sem expor dados)
      const sb = supabaseBrowser();
      const { data, error } = await sb.rpc("username_available", { p_username: clean });
      if (error) throw error;
      setUserState(data === true ? "ok" : "bad");
    } catch {
      setUserState("idle");
    }
  }, 450);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError(t("errors.invalidEmail"));
    if (password.length < 8) return setError(t("errors.weakPassword"));
    if (displayName.trim().length < 2 || displayName.trim().length > 40) {
      return setError(t("errors.displayName"));
    }
    const clean = normalizeUsername(username);
    const badUser = validateUsername(clean);
    if (badUser) return setError(badUser);
    const age = ageFromBirthdate(birthdate);
    if (age === null || age < minAge()) return setError(t("errors.tooYoung", { age: minAge() }));
    if (!accepted) return setError(t("errors.mustAcceptTerms"));

    setLoading(true);
    try {
      const { data, error: err } = await supabaseBrowser().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: clean, display_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });
      if (err) throw err;
      if (!data.session) {
        // confirmação de e-mail ativada: avisa e vai para verificação
        router.push(`/verify?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="font-display font-extrabold text-2xl">{t("auth.registerTitle")}</h1>
        <p className="text-muted mt-1">{t("auth.registerSub")}</p>
      </div>
      <Field label={t("auth.displayName")}>
        <Input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("auth.displayNamePh")} autoFocus />
      </Field>
      <Field label={t("auth.username")}>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-semibold">@</span>
          <Input
            value={username} maxLength={20} className="pl-8"
            onChange={(e) => { setUsername(e.target.value); check(e.target.value); }}
            placeholder={t("auth.usernamePh")} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {userState === "checking" && <Spinner size={17} />}
            {userState === "ok" && <Icon name="check" size={18} className="text-[var(--ok)]" />}
            {userState === "bad" && <Icon name="x" size={18} className="text-danger" />}
          </span>
        </div>
        {userState === "ok" && <p className="text-sm text-[var(--ok)] mt-1.5">{t("auth.userOk")}</p>}
      </Field>
      <Field label={t("auth.email")}>
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.emailPh")} />
      </Field>
      <Field label={t("auth.password")}>
        <div className="relative">
          <Input
            type={show ? "text" : "password"} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPh")} className="pr-12"
          />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:bg-surface2">
            <Icon name={show ? "eye" : "lock"} size={18} />
          </button>
        </div>
      </Field>
      <Field label={t("auth.birthdate")} hint={t("auth.birthdateWhy")}>
        <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
      </Field>

      <label className="flex items-start gap-3 rounded-2xl bg-surface2 p-3.5 cursor-pointer text-sm leading-relaxed">
        <input
          type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-[#4B1FB0]"
        />
        <span>
          Li e aceito os{" "}
          <button type="button" onClick={() => setTermsOpen(true)} className="font-bold text-brand underline underline-offset-2">
            {t("auth.terms")}
          </button>{" "}
          e a{" "}
          <button type="button" onClick={() => setTermsOpen(true)} className="font-bold text-brand underline underline-offset-2">
            {t("auth.privacy")}
          </button>
          , e confirmo que tenho {minAge()} anos ou mais.
        </span>
      </label>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button type="submit" full loading={loading}>{t("auth.registerBtn")}</Button>
      <p className="text-sm text-center">
        <Link href="/login" className="font-semibold text-brand">{t("auth.toLogin")}</Link>
      </p>
      <LegalLinks className="text-xs text-center text-muted" />

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} onAccept={() => { setAccepted(true); setTermsOpen(false); toast("Termos aceitos. Obrigado! 💜", "ok"); }} />
    </form>
  );
}
