import { NextResponse } from "next/server";
import { authed, apiError } from "@/app/api/_helpers";

/**
 * GET /api/calls/ice — servidores ICE (STUN sempre; TURN se configurado).
 * Mantém o segredo do TURN fora do bundle (só logado lê).
 */
export async function GET() {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  const stun = (process.env.NEXT_PUBLIC_STUN_URLS ?? "stun:stun.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: stun },
  ];
  const turnUrl = (process.env.TURN_URL ?? "").trim();
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: process.env.TURN_USERNAME ?? "",
      credential: process.env.TURN_CREDENTIAL ?? "",
    });
  }
  return NextResponse.json({ iceServers });
}
