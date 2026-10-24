import { NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { envLimit, rateLimit } from "@/lib/security";

/**
 * GET /api/calls/pending — chamada tocando para mim (com dados de quem liga).
 * Usado ao abrir o app (recuperar toque perdido) e ao receber o INSERT em
 * tempo real. Sem chamada: { call: null }.
 */
export async function GET() {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`call:${ctx.user.id}`, envLimit("RATE_CALL_PER_MIN", 10)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data: rows, error: listError } = await ctx.sb
    .from("calls")
    .select("id")
    .eq("callee_id", ctx.user.id)
    .eq("status", "ringing")
    .order("created_at", { ascending: false })
    .limit(1);
  if (listError) {
    const m = rpcErrorMessage(listError);
    return apiError(m.message, m.status);
  }
  const id = (rows?.[0] as { id?: string } | undefined)?.id;
  if (!id) return NextResponse.json({ call: null });
  const { data: call, error } = await ctx.sb.rpc("get_call", { p_call: id });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ call });
}
