import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { startCallSchema } from "@/lib/schemas";
import { notifyCall } from "@/lib/push";
import { envLimit, rateLimit, audit } from "@/lib/security";

/** POST /api/calls { conversation_id, kind } — inicia chamada 1-a-1 (voz ou vídeo). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`call:${ctx.user.id}`, envLimit("RATE_CALL_PER_MIN", 10)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: { conversation_id: string; kind: "voice" | "video" };
  try {
    body = startCallSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("start_call", {
    p_conv: body.conversation_id,
    p_kind: body.kind,
  });
  if (error) {
    const m = rpcErrorMessage(error);
    return apiError(m.message, m.status);
  }
  const row = data as { id: string; callee_id: string };
  await audit(ctx.user.id, "call_started", { conversation_id: body.conversation_id });
  // toque garantido: push para quem recebe (não espera; nunca quebra a ligação)
  void (async () => {
    try {
      const { data: me } = await ctx.sb
        .from("profiles")
        .select("display_name")
        .eq("id", ctx.user.id)
        .maybeSingle();
      const name = ((me as { display_name?: string } | null)?.display_name ?? "").trim();
      await notifyCall(row.callee_id, name || "Elio", body.kind, body.conversation_id, row.id);
    } catch {
      /* ignora */
    }
  })();
  return NextResponse.json(row);
}
