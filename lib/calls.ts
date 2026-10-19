"use client";

/**
 * Chamadas (Fase 6): tipos, config ICE, máquina de estados pura e
 * validação da sinalização (a mídia P2P fica no CallView).
 */
import { z } from "zod";

export type CallKind = "voice" | "video";
export type CallPhase = "idle" | "ringing-out" | "ringing-in" | "active" | "ended";

export interface CallPeer {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface CallSession {
  id: string;
  conversation_id: string;
  kind: CallKind;
  am_caller: boolean;
  peer: CallPeer;
}

export type CallEvent =
  | { type: "START" }
  | { type: "RING" }
  | { type: "ACCEPTED" }
  | { type: "REJECTED" }
  | { type: "BYE" }
  | { type: "TIMEOUT" }
  | { type: "RESET" };

/** Transições válidas; qualquer outra coisa mantém a fase (sinal atrasado). */
export function callReducer(phase: CallPhase, event: CallEvent): CallPhase {
  switch (phase) {
    case "idle":
      if (event.type === "START") return "ringing-out";
      if (event.type === "RING") return "ringing-in";
      return phase;
    case "ringing-out":
      if (event.type === "ACCEPTED") return "active";
      if (event.type === "REJECTED" || event.type === "BYE" || event.type === "TIMEOUT") {
        return "ended";
      }
      return phase;
    case "ringing-in":
      if (event.type === "ACCEPTED") return "active";
      if (event.type === "REJECTED" || event.type === "BYE" || event.type === "TIMEOUT") {
        return "ended";
      }
      return phase;
    case "active":
      if (event.type === "BYE") return "ended";
      return phase;
    case "ended":
      if (event.type === "RESET") return "idle";
      return phase;
  }
}

/* ---------- sinalização (validada; estranho não derruba a chamada) ---------- */

export const ringPayloadSchema = z.object({
  call_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  kind: z.enum(["voice", "video"]),
  from: z.object({
    id: z.string().uuid(),
    username: z.string().max(40),
    display_name: z.string().max(80),
    avatar_url: z.string().max(500).nullable(),
  }),
});

export const sdpPayloadSchema = z.object({
  sdp: z.object({ type: z.string().max(20), sdp: z.string().max(20000) }),
});

export const icePayloadSchema = z.object({
  candidate: z.object({
    candidate: z.string().max(2000),
    sdpMid: z.string().max(50).nullable(),
    sdpMLineIndex: z.number().nullable(),
  }),
});

export const byePayloadSchema = z.object({
  reason: z.enum(["cancel", "reject", "timeout", "hangup", "failed"]),
});

export function ringChannel(userId: string): string {
  return `elio:ring:${userId}`;
}

export function callChannel(callId: string): string {
  return `elio:call:${callId}`;
}

/** 45 s tocando sem resposta = não atendida (servidor tolera 90 s). */
export const RING_TIMEOUT_MS = 45_000;
