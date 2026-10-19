import { type NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { authed, apiError, zodError } from "@/app/api/_helpers";
import { envLimit, rateLimit } from "@/lib/security";

/** POST /api/presence { presence? } — heartbeat (visto por último) + troca de status. */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`presence:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return NextResponse.json({ ok: true }); // heartbeat estourado: só ignora
  }
  let presence: string | undefined;
  try {
    const parsed = z.object({ presence: z.enum(["online", "away", "busy", "invisible"]).optional() }).parse(
      await req.json().catch(() => ({})),
    );
    presence = parsed.presence;
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if (presence) patch.presence = presence;
  await ctx.sb.from("profiles").update(patch).eq("id", ctx.user.id);
  return NextResponse.json({ ok: true });
}
