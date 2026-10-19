import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { pushUnsubscribeSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";

/** POST /api/push/unsubscribe { endpoint } — remove minha inscrição push. */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: { endpoint: string };
  try {
    body = pushUnsubscribeSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("delete_push_subscription", {
    p_endpoint: body.endpoint,
  });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data as { deleted: boolean });
}
