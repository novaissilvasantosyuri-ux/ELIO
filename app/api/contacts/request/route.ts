import { type NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { usernameSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

/** POST /api/contacts/request { username } — envia solicitação (valida bloqueio/privacidade). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`contact:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let username: string;
  try {
    username = z.object({ username: usernameSchema }).parse(await req.json()).username;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("create_contact_request", { p_username: username });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  await audit(ctx.user.id, "contact_requested", {});
  return NextResponse.json(data);
}
