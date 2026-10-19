import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { profilePatchSchema } from "@/lib/schemas";
import { clientIp, envLimit, rateLimit, audit } from "@/lib/security";

/** PATCH /api/profile — atualiza o próprio perfil (username passa pelo RPC com limite). */
export async function PATCH(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`profile:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let body: Record<string, unknown>;
  try {
    body = profilePatchSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }

  const { username, ...rest } = body;

  // troca de @ com limite (3/30 dias) — validada no servidor
  if (typeof username === "string") {
    const { error } = await ctx.sb.rpc("change_username", { p_username: username });
    if (error) {
      const m = rpcErrorMessage(error);
      return apiError(m.message, m.status);
    }
    await audit(ctx.user.id, "username_changed", {});
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) patch[k] = v;
  }
  if (Object.keys(patch).length > 0) {
    // avatar/banner: só aceita caminhos do nosso Storage (nada de URL externa arbitrária)
    for (const f of ["avatar_url", "banner_url"] as const) {
      const v = patch[f];
      if (typeof v === "string" && v.length > 0) {
        const ok =
          v.startsWith("avatars/") || v.startsWith("banners/") || v.includes("/avatars/") || v.includes("/banners/");
        if (!ok) return apiError("Imagem inválida. Envie pelo app.", 400);
      }
    }
    const { error } = await ctx.sb.from("profiles").update(patch).eq("id", ctx.user.id);
    if (error) return apiError("Não foi possível salvar. Tente de novo.", 500);
  }

  const { data } = await ctx.sb.from("profiles").select("*").eq("id", ctx.user.id).single();
  return NextResponse.json({ profile: data });
}
