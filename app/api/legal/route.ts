import { type NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

/** GET /api/legal?kind=terms|privacy — texto legal publicado (leitura pública). */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "terms" && kind !== "privacy") {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  }
  try {
    const sb = await supabaseRoute();
    const { data } = await sb
      .from("legal_texts")
      .select("title, body_md, published_at, version")
      .eq("kind", kind)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return NextResponse.json({ legal: null });
    return NextResponse.json({ legal: data });
  } catch {
    return NextResponse.json({ legal: null });
  }
}
