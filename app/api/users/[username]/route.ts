import { type NextRequest, NextResponse } from "next/server";
import { authed, apiError, rpcErrorMessage } from "@/app/api/_helpers";
import { normalizeUsername } from "@/lib/utils";
import { envLimit, rateLimit } from "@/lib/security";

type Ctx = { params: Promise<{ username: string }> };

/**
 * GET /api/users/[username] — cartão de perfil (RLS decide se posso ver;
 * presença/"visto por último" já vêm filtrados pela privacidade da pessoa).
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await authed();
  if (!ctx) return apiError("Sua sessão expirou. Entre de novo.", 401);
  if (!(await rateLimit(`rpc:${ctx.user.id}`, envLimit("RATE_RPC_PER_MIN", 120)))) {
    return apiError("Muitas tentativas. Aguarde um pouco.", 429);
  }
  const { username } = await params;
  const u = normalizeUsername(decodeURIComponent(username));
  const { data: p } = await ctx.sb.from("profiles").select("*").eq("username", u).maybeSingle();
  if (!p) return NextResponse.json({ profile: null });
  const profile = p as Record<string, unknown>;
  const pid = profile.id as string;

  const [contact, block, mute, presence] = await Promise.all([
    ctx.sb.from("contacts").select("contact_id").eq("user_id", ctx.user.id).eq("contact_id", pid).maybeSingle(),
    ctx.sb.from("blocks").select("blocked_id").eq("blocker_id", ctx.user.id).eq("blocked_id", pid).maybeSingle(),
    ctx.sb.from("mutes").select("muted_user_id").eq("user_id", ctx.user.id).eq("muted_user_id", pid).maybeSingle(),
    ctx.sb.rpc("get_presence", { p_ids: [pid] }),
  ]);
  if (presence.error) {
    const m = rpcErrorMessage(presence.error);
    return apiError(m.message, m.status);
  }
  const pr = ((presence.data ?? []) as Array<{ presence: string; last_seen_at: string | null }>)[0];
  return NextResponse.json({
    profile: {
      ...profile,
      presence: pr?.presence ?? "offline",
      last_seen_at: pr?.last_seen_at ?? null,
    },
    is_contact: !!contact.data,
    blocked_by_me: !!block.data,
    muted_by_me: !!mute.data,
    is_self: pid === ctx.user.id,
  });
}
