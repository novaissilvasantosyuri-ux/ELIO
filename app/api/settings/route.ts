import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, zodError } from "@/app/api/_helpers";
import { isStoragePath, settingsPatchSchema } from "@/lib/schemas";
import { clientIp, envLimit, rateLimit } from "@/lib/security";

/** PATCH /api/settings — salva aparência/privacidade/notificações na conta (sincroniza aparelhos). */
export async function PATCH(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`settings:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  void clientIp;
  let body: Record<string, unknown>;
  try {
    body = settingsPatchSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  // wallpaper por imagem: só do nosso Storage
  const w = (body as { wallpaper?: { value?: { kind?: string; url?: string } } }).wallpaper;
  if (w?.value?.kind === "image") {
    const url = w.value.url ?? "";
    if (!isStoragePath(url)) {
      return apiError("Imagem inválida. Envie pelo app.", 400);
    }
  }
  const { error } = await ctx.sb
    .from("user_settings")
    .upsert({ user_id: ctx.user.id, ...body }, { onConflict: "user_id" });
  if (error) return apiError("Não foi possível salvar. Tente de novo.", 500);
  const { data } = await ctx.sb.from("user_settings").select("*").eq("user_id", ctx.user.id).single();
  return NextResponse.json({ settings: data });
}
