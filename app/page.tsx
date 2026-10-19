import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ElioLogo, ElioMark } from "@/components/brand";
import { Icon } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

/** Capa do Elio (quem já está logado vai direto para as conversas). */
export default async function LandingPage() {
  const store = await cookies();
  const sb = supabaseServer({
    getAll: () => store.getAll(),
    setAll: () => {},
  });
  const { data } = await sb.auth.getUser();
  if (data.user) redirect("/conversas");

  const feats = [
    { icon: "chat", title: t("landing.f1t"), desc: t("landing.f1d") },
    { icon: "shield", title: t("landing.f2t"), desc: t("landing.f2d") },
    { icon: "sliders", title: t("landing.f3t"), desc: t("landing.f3d") },
  ] as const;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-5 tablet:px-10 h-[72px] max-w-6xl mx-auto w-full">
        <ElioLogo />
        <div className="flex gap-2 shrink-0">
          <Link href="/login" className="h-10 sm:h-11 px-3 sm:px-5 inline-flex items-center rounded-2xl font-semibold text-sm sm:text-[15px] text-ink hover:bg-surface2 whitespace-nowrap">
            {t("landing.login")}
          </Link>
          <Link href="/register" className="h-10 sm:h-11 px-3 sm:px-5 inline-flex items-center rounded-2xl font-semibold text-sm sm:text-[15px] text-white bg-gradient-to-r from-[var(--brand-deep)] to-[var(--brand)] shadow-soft whitespace-nowrap">
            <span className="sm:hidden">Criar conta</span>
            <span className="hidden sm:inline">{t("landing.register")}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-5 pb-16 max-w-3xl mx-auto w-full">
        <ElioMark size={88} />
        <h1 className="font-display font-black text-5xl tablet:text-6xl mt-6 tracking-tight">
          {t("landing.title")}
        </h1>
        <p className="text-muted text-lg mt-4 max-w-xl leading-relaxed">{t("landing.subtitle")}</p>
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Link href="/register" className="h-12 px-8 inline-flex items-center justify-center rounded-2xl font-bold text-white bg-gradient-to-r from-[var(--brand-deep)] to-[var(--brand)] shadow-pop">
            {t("landing.register")}
          </Link>
          <Link href="/login" className="h-12 px-8 inline-flex items-center justify-center rounded-2xl font-bold border border-line bg-surface">
            {t("landing.login")}
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-12 w-full text-left">
          {feats.map((f) => (
            <div key={f.title} className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
              <span className="w-11 h-11 rounded-2xl bg-brand-soft text-brand inline-flex items-center justify-center mb-3">
                <Icon name={f.icon} size={22} />
              </span>
              <p className="font-display font-extrabold">{f.title}</p>
              <p className="text-sm text-muted mt-1 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="pb-8 text-center text-sm text-muted">
        <Link href="/legal/termos" className="underline underline-offset-2">{t("landing.terms")}</Link>
        {" · "}
        <Link href="/legal/privacidade" className="underline underline-offset-2">{t("landing.privacy")}</Link>
      </footer>
    </div>
  );
}
