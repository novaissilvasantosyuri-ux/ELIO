import { describe, expect, it } from "vitest";
import { buildContents, iaFallback, IA_SYSTEM_PROMPT, type IaHistoryMsg } from "./ia";

const msg = (p: Partial<IaHistoryMsg> & { body: string }): IaHistoryMsg => ({
  mine: false,
  is_ai: false,
  type: "text",
  ...p,
});

describe("Elio IA (Fase 5)", () => {
  it("prompt do sistema em pt-BR, sem afirmar ser humano", () => {
    expect(IA_SYSTEM_PROMPT).toMatch(/português do Brasil/i);
    expect(IA_SYSTEM_PROMPT).toMatch(/nunca afirme ser/i);
  });

  it("monta turnos cronológicos começando com user", () => {
    const h = [
      msg({ is_ai: true, body: "Oi! Eu sou a Elio IA" }), // saudação inicial sai
      msg({ mine: true, body: "resuma: oi" }),
      msg({ is_ai: true, body: "Resumo: oi!" }),
      msg({ mine: true, body: "valeu" }),
    ];
    const turns = buildContents(h);
    expect(turns[0]).toEqual({ role: "user", text: "resuma: oi" });
    expect(turns.map((x) => x.role)).toEqual(["user", "model", "user"]);
  });

  it("pula sistema, mídia e vazios; limita turnos e tamanho", () => {
    const h = [
      msg({ mine: true, type: "image", body: "📷" }),
      msg({ body: "   " }),
      msg({ body: "sistema", type: "system" }),
      msg({ mine: true, body: "x".repeat(5000) }),
    ];
    const turns = buildContents(h, 20);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.text).toHaveLength(2000);
    const many = Array.from({ length: 30 }, (_, i) =>
      msg({ mine: i % 2 === 0, is_ai: i % 2 === 1, body: `m${i}` }),
    );
    expect(buildContents(many, 10)).toHaveLength(10);
  });

  it("fallback amigável", () => {
    expect(iaFallback().length).toBeGreaterThan(10);
  });
});
