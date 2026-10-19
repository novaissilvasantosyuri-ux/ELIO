import { NextResponse } from "next/server";

/** Checagem simples de vida (deploy e testes). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "elio",
    version: "0.1.0",
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    time: new Date().toISOString(),
  });
}
