"use client";

/**
 * Tela da chamada (Fase 6): WebRTC P2P com sinalização via Realtime broadcast.
 * O provedor cuida da API/fases; aqui é mídia + tela.
 */
import React, { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Avatar, Icon, IconButton } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  byePayloadSchema, callChannel, icePayloadSchema, sdpPayloadSchema, type CallSession,
} from "@/lib/calls";
import { friendlyError } from "@/lib/utils";
import { t } from "@/lib/i18n";

interface Props {
  session: CallSession;
  active: boolean;
  onHangup: () => void;
  onRemoteBye: () => void;
  onFailed: (message: string) => void;
}

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function CallView({ session, active, onHangup, onRemoteBye, onFailed }: Props) {
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const byeRef = useRef(onRemoteBye);
  const failedRef = useRef(onFailed);
  useEffect(() => {
    byeRef.current = onRemoteBye;
    failedRef.current = onFailed;
  });

  const video = session.kind === "video";

  // cronômetro da chamada ativa
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [active]);

  // anexa streams aos <video>
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // WebRTC: mídia + peer connection + sinalização
  useEffect(() => {
    let cancelled = false;
    const pendingIce: RTCIceCandidateInit[] = [];
    let remoteReady = false;

    async function init() {
      const sb = supabaseBrowser();
      // 1. servidores ICE
      let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
      try {
        const res = await fetch("/api/calls/ice");
        const json = (await res.json()) as { iceServers?: RTCIceServer[] };
        if (res.ok && json.iceServers?.length) iceServers = json.iceServers;
      } catch {
        /* STUN padrão */
      }
      if (cancelled) return;

      // 2. microfone/câmera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      } catch {
        if (!cancelled) failedRef.current(t("calls.micDenied"));
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      setLocalStream(stream);

      // 3. peer connection
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
      pc.ontrack = (ev) => {
        const incoming = ev.streams[0];
        if (incoming && !cancelled) setRemoteStream(incoming);
      };
      pc.onconnectionstatechange = () => {
        if (!cancelled && pc.connectionState === "failed") {
          failedRef.current(t("calls.connFailed"));
        }
      };

      // 4. canal de sinalização
      const ch = sb.channel(callChannel(session.id), { config: { broadcast: { self: false } } });
      chRef.current = ch;
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void ch
            .send({
              type: "broadcast",
              event: "ice",
              payload: {
                candidate: {
                  candidate: ev.candidate.candidate,
                  sdpMid: ev.candidate.sdpMid,
                  sdpMLineIndex: ev.candidate.sdpMLineIndex,
                },
              },
            })
            .catch(() => undefined);
        }
      };
      ch.on("broadcast", { event: "sdp" }, async (p) => {
        const parsed = sdpPayloadSchema.safeParse(p.payload);
        if (!parsed.success || cancelled) return;
        try {
          await pc.setRemoteDescription(parsed.data.sdp as RTCSessionDescriptionInit);
          remoteReady = true;
          for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
          if (parsed.data.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await ch
              .send({ type: "broadcast", event: "sdp", payload: { sdp: { type: answer.type, sdp: answer.sdp } } })
              .catch(() => undefined);
          }
        } catch {
          /* oferta inválida: ignora */
        }
      });
      ch.on("broadcast", { event: "ice" }, async (p) => {
        const parsed = icePayloadSchema.safeParse(p.payload);
        if (!parsed.success || cancelled) return;
        const init = parsed.data.candidate as RTCIceCandidateInit;
        if (remoteReady) await pc.addIceCandidate(init).catch(() => undefined);
        else pendingIce.push(init);
      });
      ch.on("broadcast", { event: "bye" }, (p) => {
        if (byePayloadSchema.safeParse(p.payload).success && !cancelled) byeRef.current();
      });
      // quem recebe avisa "pronto"; quem liga (re)envia a oferta (a 1ª pode se perder)
      async function sendOffer() {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await ch
            .send({ type: "broadcast", event: "sdp", payload: { sdp: { type: offer.type, sdp: offer.sdp } } })
            .catch(() => undefined);
        } catch {
          if (!cancelled) failedRef.current(t("calls.connFailed"));
        }
      }
      if (session.am_caller) {
        ch.on("broadcast", { event: "ready" }, () => {
          if (!cancelled) void sendOffer();
        });
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000);
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      if (cancelled) return;

      // 5. oferta inicial (quem liga) / aviso de pronto (quem recebe)
      if (session.am_caller) {
        await sendOffer();
      } else {
        await ch.send({ type: "broadcast", event: "ready", payload: {} }).catch(() => undefined);
      }
    }

    void init().catch((e: unknown) => {
      if (!cancelled) failedRef.current(friendlyError(e));
    });

    return () => {
      cancelled = true;
      try {
        chRef.current && void supabaseBrowser().removeChannel(chRef.current);
      } catch {
        /* ignora */
      }
      chRef.current = null;
      try {
        pcRef.current?.close();
      } catch {
        /* ignora */
      }
      pcRef.current = null;
      setLocalStream((prev) => {
        prev?.getTracks().forEach((tr) => tr.stop());
        return null;
      });
      setRemoteStream(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  function toggleMute() {
    const next = !muted;
    localStream?.getAudioTracks().forEach((tr) => {
      tr.enabled = !next;
    });
    setMuted(next);
  }

  function toggleCam() {
    const next = !camOff;
    localStream?.getVideoTracks().forEach((tr) => {
      tr.enabled = !next;
    });
    setCamOff(next);
  }

  const status = !active ? t("calls.calling") : fmtElapsed(elapsed);

  return (
    <div className="fixed inset-0 z-[var(--z-call,_80)] bg-black/90 flex flex-col items-center justify-between p-6" role="dialog" aria-modal="true" aria-label={t("calls.title")}>
      {/* remoto: vídeo ou avatar */}
      <div className="flex-1 w-full max-w-lg flex items-center justify-center relative">
        {video && remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full max-h-[50vh] rounded-3xl object-cover bg-black" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar src={session.peer.avatar_url} name={session.peer.display_name} size="lg" className="!w-24 !h-24 !text-3xl" />
            <p className="text-white font-display font-extrabold text-2xl">{session.peer.display_name}</p>
            <p className="text-white/70 font-semibold anim-pulse">{status}</p>
          </div>
        )}
        {video && (
          <div className="absolute bottom-2 right-2 w-28 h-40 rounded-2xl overflow-hidden bg-black/60 border border-white/20">
            {localStream && !camOff ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon name="video" size={24} className="text-white/50" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* controles */}
      <div className="flex items-center gap-4 pb-4">
        <span className="inline-flex flex-col items-center gap-1">
          <IconButton
            label={muted ? t("calls.unmute") : t("calls.mute")}
            onClick={toggleMute}
            className={`!w-14 !h-14 !rounded-full ${muted ? "!bg-white !text-black" : "!bg-white/15 !text-white"}`}
          >
            <Icon name={muted ? "sound" : "mic"} size={24} />
          </IconButton>
          <span className="text-white/60 text-xs">{muted ? t("calls.unmute") : t("calls.mute")}</span>
        </span>
        {video && (
          <span className="inline-flex flex-col items-center gap-1">
            <IconButton
              label={camOff ? t("calls.camOn") : t("calls.camOff")}
              onClick={toggleCam}
              className={`!w-14 !h-14 !rounded-full ${camOff ? "!bg-white !text-black" : "!bg-white/15 !text-white"}`}
            >
              <Icon name="video" size={24} />
            </IconButton>
            <span className="text-white/60 text-xs">{camOff ? t("calls.camOn") : t("calls.camOff")}</span>
          </span>
        )}
        <span className="inline-flex flex-col items-center gap-1">
          <IconButton
            label={t("calls.hangup")}
            onClick={onHangup}
            className="!w-14 !h-14 !rounded-full !bg-danger !text-white"
          >
            <Icon name="phone" size={24} className="rotate-[135deg]" />
          </IconButton>
          <span className="text-white/60 text-xs">{t("calls.hangup")}</span>
        </span>
      </div>
    </div>
  );
}
