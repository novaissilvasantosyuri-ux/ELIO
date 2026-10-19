import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { receiptsSchema } from "@/lib/schemas";
import { envLimit, rateLimit } from "@/lib/security";

/** POST /api/receipts — marca entregue/lido em lote (lido respeita sua config, nos 2 sentidos). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: unknown;
  try {
    body = receiptsSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const b = body as { conversation_id: string; delivered_ids: string[]; read_ids: string[] };
  const { data, error } = await ctx.sb.rpc("set_receipts", {
    p_conv: b.conversation_id,
    p_delivered: b.delivered_ids,
    p_read: b.read_ids,
  });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  return NextResponse.json(data);
}
