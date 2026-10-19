import { describe, expect, it } from "vitest";
import {
  avatarColor, fmtDayDivider, fmtListTime, initialsOf, linkify,
  normalizeUsername, validateUsername,
} from "@/lib/utils";

describe("avatar", () => {
  it("gera iniciais", () => {
    expect(initialsOf("Ana Clara")).toBe("AC");
    expect(initialsOf("bruno")).toBe("BR");
    expect(initialsOf("  ")).toBe("?");
  });
  it("cor estável por nome", () => {
    expect(avatarColor("Ana")).toBe(avatarColor("Ana"));
    expect(avatarColor("Ana")).not.toBe(avatarColor("BrunoXYZ123"));
  });
});

describe("username", () => {
  it("normaliza", () => {
    expect(normalizeUsername(" @Ana.Clara ")).toBe("ana.clara");
  });
  it("valida formato", () => {
    expect(validateUsername("ana.clara")).toBeNull();
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("ANA ESPAÇO")).not.toBeNull();
    expect(validateUsername("ok_123.xyz")).toBeNull();
  });
});

describe("datas", () => {
  it("lista: hoje vira hora", () => {
    const now = new Date("2026-10-18T15:30:00");
    expect(fmtListTime("2026-10-18T14:05:00", now)).toBe("14:05");
  });
  it("lista: ontem vira 'Ontem'", () => {
    const now = new Date("2026-10-18T15:30:00");
    expect(fmtListTime("2026-10-17T20:00:00", now)).toBe("Ontem");
  });
  it("divisor: Hoje/Ontem/data longa", () => {
    const now = new Date("2026-10-18T15:30:00");
    expect(fmtDayDivider("2026-10-18T10:00:00", now)).toBe("Hoje");
    expect(fmtDayDivider("2026-10-17T10:00:00", now)).toBe("Ontem");
    expect(fmtDayDivider("2026-10-10T10:00:00", now)).toContain("outubro");
  });
});

describe("linkify", () => {
  it("separa texto e links sem HTML", () => {
    const parts = linkify("olha https://elio.app legal");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toEqual({ kind: "link", href: "https://elio.app", label: "https://elio.app" });
  });
  it("não executa nada (só texto)", () => {
    const parts = linkify('<script>alert("x")</script>');
    expect(parts).toEqual([{ kind: "text", text: '<script>alert("x")</script>' }]);
  });
});
