import { describe, expect, it } from "vitest";
import {
  byePayloadSchema,
  callChannel,
  callReducer,
  icePayloadSchema,
  ringChannel,
  ringPayloadSchema,
  sdpPayloadSchema,
} from "./calls";

describe("chamadas (Fase 6)", () => {
  it("quem liga: idle → tocando → ativa → fim", () => {
    expect(callReducer("idle", { type: "START" })).toBe("ringing-out");
    expect(callReducer("ringing-out", { type: "ACCEPTED" })).toBe("active");
    expect(callReducer("active", { type: "BYE" })).toBe("ended");
    expect(callReducer("ended", { type: "RESET" })).toBe("idle");
  });

  it("quem recebe: recusar, timeout e sinais atrasados", () => {
    expect(callReducer("idle", { type: "RING" })).toBe("ringing-in");
    expect(callReducer("ringing-in", { type: "REJECTED" })).toBe("ended");
    expect(callReducer("ringing-out", { type: "TIMEOUT" })).toBe("ended");
    // sinal atrasado não ressuscita nem quebra
    expect(callReducer("ended", { type: "ACCEPTED" })).toBe("ended");
    expect(callReducer("active", { type: "RING" })).toBe("active");
    expect(callReducer("idle", { type: "BYE" })).toBe("idle");
  });

  it("sinalização: aceita o válido, barra o estranho", () => {
    const ring = {
      call_id: "123e4567-e89b-12d3-a456-426614174000",
      conversation_id: "123e4567-e89b-12d3-a456-426614174001",
      kind: "video",
      from: { id: "123e4567-e89b-12d3-a456-426614174002", username: "ana", display_name: "Ana", avatar_url: null },
    };
    expect(ringPayloadSchema.safeParse(ring).success).toBe(true);
    expect(ringPayloadSchema.safeParse({ ...ring, kind: "holograma" }).success).toBe(false);
    expect(sdpPayloadSchema.safeParse({ sdp: { type: "offer", sdp: "v=0" } }).success).toBe(true);
    expect(sdpPayloadSchema.safeParse({ sdp: "v=0" }).success).toBe(false);
    expect(
      icePayloadSchema.safeParse({ candidate: { candidate: "c", sdpMid: "0", sdpMLineIndex: 0 } }).success,
    ).toBe(true);
    expect(icePayloadSchema.safeParse({ candidate: { candidate: "" } }).success).toBe(false);
    expect(byePayloadSchema.safeParse({ reason: "hangup" }).success).toBe(true);
    expect(byePayloadSchema.safeParse({ reason: "sumiu" }).success).toBe(false);
  });

  it("nomes de canal estáveis", () => {
    expect(ringChannel("u1")).toBe("elio:ring:u1");
    expect(callChannel("c1")).toBe("elio:call:c1");
  });
});
