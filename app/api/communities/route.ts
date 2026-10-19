import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { authed, apiError, rpcErrorMessage, zodError } from "@/app/api/_helpers";
import { createCommunitySchema } from "@/lib/schemas";
import { envLimit, rateLimit, audit } from "@/lib/security";
import type { CommunityItem } from "@/lib/supabase/types";

/** GET /api/communities — minhas comunidades (via RPC seguro). */
export async function GET() {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { data, error } = await ctx.sb.rpc("get_communities");
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  return NextResponse.json({ communities: (data ?? []) as CommunityItem[] });
}

/** POST /api/communities { name, description? } — cria (nasce com #geral + #anúncios). */
export async function POST(req: NextRequest) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`mk:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  let parsed: { name: string; description: string };
  try {
    parsed = createCommunitySchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return zodError(e);
    return apiError("Dados inválidos.", 400);
  }
  const { data, error } = await ctx.sb.rpc("create_community", {
    p_name: parsed.name,
    p_description: parsed.description,
  });
  if (error) {
    const m = rpcErrorMessage(error, "community");
    return apiError(m.message, m.status);
  }
  const row = data as { id: string };
  await audit(ctx.user.id, "community_created", { community_id: row.id });
  return NextResponse.json({ id: row.id, created: true });
}
