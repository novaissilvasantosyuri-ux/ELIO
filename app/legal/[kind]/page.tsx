import Link from "next/link";
import { notFound } from "next/navigation";
import { ElioLogo } from "@/components/brand";
import { Markdown } from "@/components/legal/Legal";
import { supabaseServer } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type Ctx = { params: Promise<{ kind: string }> };

const MAP: Record<string, "terms" | "privacy"> = {
  termos: "terms",
  privacidade: "privacy",
};

/** Termos e Privacidade (públicos; texto vem do banco, editável). */
export default async function LegalPage({ params }: Ctx) {
  const { kind } = await params;
  const dbKind = MAP[kind];
  if (!dbKind) notFound();

  let doc: { title: string; body_md: string } | null = null;
  try {
    const store = await cookies();
    const sb = supabaseServer({
      getAll: () => store.getAll(),
      setAll: () => {},
    });
    const { data } = await sb
      .from("legal_texts")
      .select("title, body_md")
      .eq("kind", dbKind)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    doc = (data ?? null) as { title: string; body_md: string } | null;
  } catch {
    /* reserva abaixo */
  }

  return (
    <div className="min-h-dvh px-4 py-8 max-w-2xl mx-auto w-full flex flex-col gap-5">
      <Link href="/" aria-label="Elio — início" className="self-start">
        <ElioLogo compact />
      </Link>
      <article className="rounded-3xl border border-line bg-surface shadow-soft p-6 tablet:p-8">
        {doc ? (
          <Markdown md={doc.body_md} />
        ) : (
          <p className="text-muted">
            Não foi possível carregar agora. Volte em instantes — ou fale com a gente pelo app.
          </p>
        )}
      </article>
      <p className="text-center text-sm">
        <Link href="/" className="font-semibold text-brand">Voltar ao início</Link>
      </p>
    </div>
  );
}
