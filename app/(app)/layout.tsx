import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { supabaseServer } from "@/lib/supabase/server";

/** Área logada: exige sessão e onboarding concluído. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const sb = supabaseServer({
    getAll: () => store.getAll(),
    setAll: () => {},
  });
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("onboarded_at")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  return <AppShell>{children}</AppShell>;
}
