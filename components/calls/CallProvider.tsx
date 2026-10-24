"use client";

/**
 * Provedor global de chamadas (Fase 6): ouve o toque, gerencia fases via API
 * e renderiza a chamada recebida + a tela de chamada.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Avatar, Icon, IconButton } from "@/components/ui";
import { useApp, useToast } from "@/components/providers";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  callChannel, callReducer, ringChannel, ringPayloadSchema, RING_TIMEOUT_MS,
  type CallKind, type CallPeer, type CallPhase, type CallSession,
} from "@/lib/calls";
import { friendlyError, playPop, playRing, unlockAudio } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { CallView } from "@/components/calls/CallView";

interface CallCtxValue {
  phase: CallPhase;
  session: CallSession | null;
  start: (conversationId: string, kind: CallKind, peer: CallPeer) => void;
}

const CallCtx = createContext<CallCtxValue>({
  phase: "idle",
  session: null,
  start: () => {},
});

export const useCall = () => useContext(CallCtx);

async function broadcast(event: { channel: string; event: string; payload: Record<string, unknown> }) {
  const sb = supabaseBrowser();
  const ch = sb.channel(event.channel, { config: { broadcast: { self: false } } });
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await ch.send({ type: "broadcast", event: event.event, payload: event.payload });
  } catch {
    /* sinalização é melhor esforço */
  } finally {
    try {
      await sb.removeChannel(ch);
    } catch {
      /* ignora */
    }
  }
}

function IncomingCall({ session, onAccept, onReject }: {
  session: CallSession;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[var(--z-call,_80)] bg-black/90 flex flex-col items-center justify-center gap-6 p-6" role="dialog" aria-modal="true" aria-label={t("calls.incoming")}>
      <div className="flex flex-col items-center gap-3 text-center anim-pop">
        <Avatar src={session.peer.avatar_url} name={session.peer.display_name} size="lg" className="!w-24 !h-24 !text-3xl" />
        <p className="text-white font-display font-extrabold text-2xl">{session.peer.display_name}</p>
        <p className="text-white/70 font-semibold anim-pulse">
          {session.kind === "video" ? t("calls.incomingVideo") : t("calls.incomingVoice")}
        </p>
      </div>
      <div className="flex items-center gap-8">
        <span className="inline-flex flex-col items-center gap-1">
          <IconButton label={t("calls.reject")} onClick={onReject} className="!w-16 !h-16 !rounded-full !bg-danger !text-white">
            <Icon name="phone" size={26} className="rotate-[135deg]" />
          </IconButton>
          <span className="text-white/60 text-xs">{t("calls.reject")}</span>
        </span>
        <span className="inline-flex flex-col items-center gap-1">
          <IconButton label={t("calls.accept")} onClick={onAccept} className="!w-16 !h-16 !rounded-full !bg-[var(--ok)] !text-white">
            <Icon name="phone" size={26} />
          </IconButton>
          <span className="text-white/60 text-xs">{t("calls.accept")}</span>
        </span>
      </div>
    </div>
  );
}

export function CallProvider({ children }: { children?: React.ReactNode }) {
  const { toast } = useToast();
  const { user, profile } = useApp();
  const [phase, dispatch] = useReducer(callReducer, "idle");
  const [session, setSession] = useState<CallSession | null>(null);
  const phaseRef = useRef(phase);
  const sessionRef = useRef(session);
  useEffect(() => {
    phaseRef.current = phase;
    sessionRef.current = session;
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRemoteByeRef = useRef(() => {});

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (ringRef.current) clearInterval(ringRef.current);
    timeoutRef.current = null;
    ringRef.current = null;
  }, []);

  const endRemote = useCallback(async (callId: string, action: "cancel" | "reject" | "timeout" | "hangup") => {
    try {
      await fetch(`/api/calls/${callId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      /* estado do servidor se resolve no timeout */
    }
  }, []);

  const resetSoon = useCallback(() => {
    setTimeout(() => {
      setSession(null);
      dispatch({ type: "RESET" });
    }, 1200);
  }, []);

  // desbloqueia o som no 1º gesto (exigência do navegador p/ o toque tocar)
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const startRingtone = useCallback(() => {
    const ring = () => {
      try {
        navigator.vibrate?.([400, 200, 400, 200, 800]);
      } catch {
        /* sem vibração */
      }
      playRing();
    };
    ring();
    ringRef.current = setInterval(ring, 2500);
  }, []);

  /* ---------- quem liga ---------- */

  const start = useCallback((conversationId: string, kind: CallKind, peer: CallPeer) => {
    if (phaseRef.current !== "idle" || !user) {
      if (phaseRef.current !== "idle") toast(t("calls.busy"), "error");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast(t("calls.unsupported"), "error");
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId, kind }),
        });
        const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok) throw new Error(json.error);
        if (!json.id) throw new Error(t("errors.generic"));
        const s: CallSession = {
          id: json.id, conversation_id: conversationId, kind, am_caller: true, peer,
        };
        setSession(s);
        dispatch({ type: "START" });
        await broadcast({
          channel: ringChannel(peer.id),
          event: "ring",
          payload: {
            call_id: s.id,
            conversation_id: conversationId,
            kind,
            from: {
              id: user.id,
              username: profile?.username ?? "",
              display_name: profile?.display_name ?? "",
              avatar_url: profile?.avatar_url ?? null,
            },
          },
        });
        timeoutRef.current = setTimeout(() => {
          if (phaseRef.current !== "ringing-out") return;
          void broadcast({ channel: callChannel(s.id), event: "bye", payload: { reason: "timeout" } });
          void endRemote(s.id, "cancel");
          dispatch({ type: "TIMEOUT" });
          toast(t("calls.unanswered"), "info");
          resetSoon();
        }, RING_TIMEOUT_MS);
      } catch (e) {
        toast(friendlyError(e), "error");
      }
    })();
  }, [user, profile, toast, endRemote, resetSoon]);

  /* ---------- quem recebe: ouve o toque (3 caminhos) ---------- */

  /** Toca de verdade (idempotente: mesma chamada não toca 2x). */
  const handleIncomingRing = useCallback((r: {
    call_id: string; conversation_id: string; kind: CallKind; peer: CallPeer;
  }) => {
    if (phaseRef.current !== "idle") return; // ocupado: ignora
    if (sessionRef.current?.id === r.call_id) return; // já tocando esta: ignora
    const s: CallSession = {
      id: r.call_id,
      conversation_id: r.conversation_id,
      kind: r.kind,
      am_caller: false,
      peer: r.peer,
    };
    setSession(s);
    dispatch({ type: "RING" });
    startRingtone();
    timeoutRef.current = setTimeout(() => {
      if (phaseRef.current !== "ringing-in") return;
      void endRemote(s.id, "timeout");
      dispatch({ type: "TIMEOUT" });
      toast(t("calls.missed"), "info");
      resetSoon();
    }, RING_TIMEOUT_MS);
  }, [endRemote, resetSoon, startRingtone, toast]);

  /** Busca chamada tocando para mim (recupera toque perdido). */
  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/calls/pending");
      const json = (await res.json().catch(() => ({}))) as {
        call?: {
          id: string; conversation_id: string; kind: CallKind; status: string;
          peer?: { id: string; username: string; display_name: string; avatar_url: string | null };
        } | null;
      };
      const c = json.call;
      if (!res.ok || !c || c.status !== "ringing" || !c.peer) return;
      handleIncomingRing({
        call_id: c.id, conversation_id: c.conversation_id, kind: c.kind, peer: c.peer,
      });
    } catch {
      /* sem pendente: segue o jogo */
    }
  }, [handleIncomingRing]);

  useEffect(() => {
    if (!user) return;
    const sb = supabaseBrowser();
    const channels: RealtimeChannel[] = [];
    try {
      // caminho 1 (rápido): broadcast do toque
      channels.push(
        sb
          .channel(ringChannel(user.id), { config: { broadcast: { self: false } } })
          .on("broadcast", { event: "ring" }, (p) => {
            const parsed = ringPayloadSchema.safeParse(p.payload);
            if (!parsed.success) return;
            const r = parsed.data;
            handleIncomingRing({
              call_id: r.call_id, conversation_id: r.conversation_id, kind: r.kind, peer: r.from,
            });
          })
          .subscribe(),
      );
      // caminho 2 (garantido): INSERT na tabela calls (o RLS só me entrega as minhas)
      channels.push(
        sb
          .channel("elio:calls")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls" }, (p) => {
            const row = (p.new ?? {}) as { callee_id?: string; status?: string };
            if (row.callee_id !== user.id || row.status !== "ringing") return;
            void fetchPending();
          })
          .subscribe(),
      );
      // caminho 3 (recuperação): ao abrir/logar, confere se tem toque me esperando
      void fetchPending();
    } catch {
      /* sem realtime: o push + pendente cobrem */
    }
    return () => {
      for (const ch of channels) {
        try {
          void sb.removeChannel(ch);
        } catch {
          /* ignora */
        }
      }
    };
  }, [user, fetchPending, handleIncomingRing]);

  /* Radar do fim: se o status mudou no servidor (recusou/desligou/caiu),
     quem está na chamada descobre mesmo se o "bye" rápido se perder. */
  const sessionId = session?.id;
  useEffect(() => {
    if (!user || !sessionId) return;
    const sb = supabaseBrowser();
    let ch: RealtimeChannel | null = null;
    try {
      ch = sb
        .channel(`elio:call-status:${sessionId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${sessionId}` },
          (p) => {
            const status = ((p.new ?? {}) as { status?: string }).status;
            if (status === "rejected" || status === "ended" || status === "missed") {
              onRemoteByeRef.current();
            }
          },
        )
        .subscribe();
    } catch {
      ch = null;
    }
    return () => {
      if (ch) {
        try {
          void sb.removeChannel(ch);
        } catch {
          /* ignora */
        }
      }
    };
  }, [user, sessionId]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  /* ---------- ações ---------- */

  const accept = useCallback(() => {
    const s = sessionRef.current;
    if (!s || phaseRef.current !== "ringing-in") return;
    clearTimers();
    void (async () => {
      try {
        const res = await fetch(`/api/calls/${s.id}/accept`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error);
        // avisa quem ligou (ele já está ouvindo o canal desde o início)
        void broadcast({ channel: callChannel(s.id), event: "accepted", payload: {} });
        dispatch({ type: "ACCEPTED" });
      } catch (e) {
        void endRemote(s.id, "timeout");
        dispatch({ type: "TIMEOUT" });
        toast(friendlyError(e), "error");
        resetSoon();
      }
    })();
  }, [clearTimers, endRemote, resetSoon, toast]);

  const reject = useCallback(() => {
    const s = sessionRef.current;
    if (!s || phaseRef.current !== "ringing-in") return;
    clearTimers();
    void broadcast({ channel: callChannel(s.id), event: "bye", payload: { reason: "reject" } });
    void endRemote(s.id, "reject");
    dispatch({ type: "REJECTED" });
    resetSoon();
  }, [clearTimers, endRemote, resetSoon]);

  const hangupLocal = useCallback(() => {
    const s = sessionRef.current;
    const ph = phaseRef.current;
    if (!s || (ph !== "ringing-out" && ph !== "active")) return;
    clearTimers();
    const reason = ph === "ringing-out" ? "cancel" : "hangup";
    void broadcast({ channel: callChannel(s.id), event: "bye", payload: { reason } });
    void endRemote(s.id, reason);
    dispatch({ type: "BYE" });
    resetSoon();
  }, [clearTimers, endRemote, resetSoon]);

  const onRemoteBye = useCallback(() => {
    const s = sessionRef.current;
    const ph = phaseRef.current;
    if (!s) return;
    clearTimers();
    if (ph === "ringing-out") toast(t("calls.unanswered"), "info");
    dispatch({ type: "BYE" });
    resetSoon();
  }, [clearTimers, resetSoon, toast]);
  useEffect(() => {
    onRemoteByeRef.current = onRemoteBye;
  });

  const onFailed = useCallback((message: string) => {
    const s = sessionRef.current;
    const ph = phaseRef.current;
    if (!s) return;
    clearTimers();
    void broadcast({ channel: callChannel(s.id), event: "bye", payload: { reason: "failed" } });
    void endRemote(s.id, ph === "active" ? "hangup" : "cancel");
    dispatch({ type: "BYE" });
    toast(message, "error");
    resetSoon();
  }, [clearTimers, endRemote, resetSoon, toast]);

  /** O outro lado atendeu (ou a resposta SDP chegou): sai do "chamando". */
  const onActive = useCallback(() => {
    if (phaseRef.current !== "ringing-out") return;
    clearTimers();
    dispatch({ type: "ACCEPTED" });
  }, [clearTimers]);

  const value = useMemo(() => ({ phase, session, start }), [phase, session, start]);

  return (
    <CallCtx.Provider value={value}>
      {children}
      {session && phase === "ringing-in" && (
        <IncomingCall session={session} onAccept={accept} onReject={reject} />
      )}
      {session && (phase === "ringing-out" || phase === "active") && (
        <CallView
          session={session}
          active={phase === "active"}
          onHangup={hangupLocal}
          onRemoteBye={onRemoteBye}
          onFailed={onFailed}
          onActive={onActive}
        />
      )}
    </CallCtx.Provider>
  );
}
