import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { supabaseServer } from "@/lib/supabase/server";

/** Onboarding (quem já concluiu volta para as conversas). */
export default async function OnboardingPage() {
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
  if (profile?.onboarded_at) redirect("/conversas");
  return <OnboardingWizard />;
}
