import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, zodError } from "@/app/api/_helpers";
import { userIdSchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";

/** POST /api/contacts/remove { user_id } — remove o par da amizade (qualquer lado pode). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`contact:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: unknown;
  try {
    body = userIdSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { user_id } = body as { user_id: string };
  if (user_id === ctx.user.id) return apiError("Você não pode fazer isso com você mesmo. 🙂", 400);
  const { error } = await ctx.sb
    .from("contacts")
    .delete()
    .or(`and(user_id.eq.${ctx.user.id},contact_id.eq.${user_id}),and(user_id.eq.${user_id},contact_id.eq.${ctx.user.id})`);
  if (error) return apiError("Não foi possível remover. Tente de novo.", 500);
  await audit(ctx.user.id, "contact_removed", {});
  return NextResponse.json({ ok: true });
}
