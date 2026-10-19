import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, zodError } from "@/app/api/_helpers";
import { contactRespondSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

/** POST /api/contacts/respond { request_id, action } — aceitar, recusar ou cancelar. */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`contact:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: unknown;
  try {
    body = contactRespondSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { request_id, action } = body as { request_id: string; action: "accept" | "decline" | "cancel" };

  const { data: r } = await ctx.sb
    .from("contact_requests")
    .select("id, from_id, to_id, status")
    .eq("id", request_id)
    .maybeSingle();
  if (!r || r.status !== "pending") return apiError("Solicitação inválida ou já respondida.", 404);

  let next: string | null = null;
  if (action === "cancel" && r.from_id === ctx.user.id) next = "canceled";
  if ((action === "accept" || action === "decline") && r.to_id === ctx.user.id) {
    next = action === "accept" ? "accepted" : "declined";
  }
  if (!next) return apiError("Você não tem permissão para isso.", 403);

  const { error } = await ctx.sb.from("contact_requests").update({ status: next }).eq("id", request_id);
  if (error) return apiError("Não foi possível responder. Tente de novo.", 500);
  await audit(ctx.user.id, `contact_${next}`, {});
  return NextResponse.json({ ok: true, status: next });
}
