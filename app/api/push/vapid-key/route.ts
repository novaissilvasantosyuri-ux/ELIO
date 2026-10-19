import { NextResponse } from "next/server";
import { authed, apiError } from "@/app/api/_helpers";

/** GET /api/push/vapid-key — chave pública VAPID (ou null se push não configurado). */
export async function GET() {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? null });
}
