import { NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { envLimit, rateLimit } from "@/lib/security";
import type { ContactRequest, ContactRow } from "@/lib/supabase/types";

/** GET /api/contacts — contatos + solicitações pendentes + bloqueados. */
export async function GET() {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const [c, r, b] = await Promise.all([
    ctx.sb.rpc("get_contacts"),
    ctx.sb.rpc("get_contact_requests"),
    ctx.sb.rpc("get_blocked"),
  ]);
  const err = c.error ?? r.error ?? b.error;
  if (err) {
    const m = rpcErrorMessage(err);
    return apiError(m.message, m.status);
  }
  const requests = ((r.data ?? []) as ContactRequest[]);
  return NextResponse.json({
    contacts: (c.data ?? []) as ContactRow[],
    received: requests.filter((x) => x.to_id === ctx.user.id),
    sent: requests.filter((x) => x.from_id === ctx.user.id),
    blocked: (b.data ?? []) as ContactRow[],
  });
}
