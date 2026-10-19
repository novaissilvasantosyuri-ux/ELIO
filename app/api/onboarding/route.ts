import { NextResponse } from "next/server";
import { authed, apiError } from "@/app/api/_helpers";

/** POST /api/onboarding — marca o onboarding como concluído (ou pulado). */
export async function POST() {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const { error } = await ctx.sb
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", ctx.user.id);
  if (error) return apiError("Não foi possível concluir. Tente de novo.", 500);
  return NextResponse.json({ ok: true });
}
