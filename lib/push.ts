/**
 * Push no servidor (Fase 4): avisa membros via Web Push. Melhor esforço —
 * nunca quebra o envio da mensagem. Só importado por API routes.
 */
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";

let vapidOk = false;

function ensureVapid(): boolean {
  if (vapidOk) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:contato@elio.exemplo", pub, priv);
  } catch {
    return false;
  }
  vapidOk = true;
  return true;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export const MEDIA_PUSH_LABEL: Record<string, string> = {
  image: "📷 Foto",
  video: "🎬 Vídeo",
  audio: "🎙️ Áudio",
  file: "📎 Arquivo",
};

interface PushTarget {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  preview_text: boolean;
}

/**
 * Notifica quem deve receber push na conversa (menos o autor e silenciados).
 * `text` é a prévia; some se o destinatário desligou prévia.
 */
export async function notifyConversation(
  sb: SupabaseClient,
  convId: string,
  senderId: string,
  text: string,
): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const [targetsRes, convRes, meRes] = await Promise.all([
      sb.rpc("get_push_targets", { p_conv: convId }),
      sb.from("conversations").select("type, title").eq("id", convId).maybeSingle(),
      sb.from("profiles").select("display_name").eq("id", senderId).maybeSingle(),
    ]);
    const targets = (targetsRes.data ?? []) as PushTarget[];
    if (targetsRes.error || targets.length === 0) return;
    const conv = (convRes.data ?? null) as { type: string; title: string } | null;
    const senderName =
      ((meRes.data as { display_name?: string } | null)?.display_name ?? "").trim() || "Elio";
    const title =
      !conv || conv.type === "direct"
        ? senderName
        : `${senderName} · ${conv.type === "channel" ? "#" : ""}${conv.title || "conversa"}`;
    const url = `/conversas/${convId}`;

    const results = await Promise.allSettled(
      targets.map((tg) =>
        webpush.sendNotification(
          { endpoint: tg.endpoint, keys: { p256dh: tg.p256dh, auth: tg.auth } },
          JSON.stringify({
            title,
            body: tg.preview_text ? text.slice(0, 140) : "Nova mensagem",
            url,
            tag: convId,
          }),
        ),
      ),
    );
    // limpa inscrições mortas (404/410) — melhor esforço
    const dead = targets.filter(
      (_, i) =>
        results[i]?.status === "rejected" &&
        [404, 410].includes(
          (results[i] as PromiseRejectedResult).reason?.statusCode ?? 0,
        ),
    );
    if (dead.length > 0) {
      const admin = supabaseAdmin();
      await admin
        .from("push_subscriptions")
        .delete()
        .in(
          "endpoint",
          dead.map((d) => d.endpoint),
        );
    }
  } catch {
    /* push nunca quebra o envio */
  }
}

/**
 * Push de chamada (toque garantido): avisa quem recebe mesmo com o app
 * em 2º plano/fechado. Tocar na notificação abre a conversa; o app então
 * busca a chamada pendente e mostra a tela de Atender/Recusar.
 */
export async function notifyCall(
  calleeId: string,
  callerName: string,
  kind: "voice" | "video",
  convId: string,
  callId: string,
): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const admin = supabaseAdmin();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", calleeId);
    const targets = (subs ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>;
    if (targets.length === 0) return;
    const name = (callerName || "").trim() || "Elio";
    const results = await Promise.allSettled(
      targets.map((tg) =>
        webpush.sendNotification(
          { endpoint: tg.endpoint, keys: { p256dh: tg.p256dh, auth: tg.auth } },
          JSON.stringify({
            title: name,
            body: kind === "video" ? "Chamada de vídeo 🎥" : "Chamada de voz 📞",
            url: `/conversas/${convId}`,
            tag: `call-${callId}`,
            type: "call",
            call_id: callId,
          }),
        ),
      ),
    );
    const dead = targets.filter(
      (_, i) =>
        results[i]?.status === "rejected" &&
        [404, 410].includes(
          (results[i] as PromiseRejectedResult).reason?.statusCode ?? 0,
        ),
    );
    if (dead.length > 0) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in(
          "endpoint",
          dead.map((d) => d.endpoint),
        );
    }
  } catch {
    /* push nunca quebra a ligação */
  }
}
