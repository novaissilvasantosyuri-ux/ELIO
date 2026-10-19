import { describe, expect, it } from "vitest";
import { fileKind, fmtDuration, fmtSize } from "./media";

describe("formatos de mídia", () => {
  it("tamanho em pt-BR", () => {
    expect(fmtSize(512)).toBe("512 B");
    expect(fmtSize(2048)).toBe("2 KB");
    expect(fmtSize(1_572_864)).toBe("1,5 MB");
    expect(fmtSize(12 * 1024 * 1024)).toBe("12 MB");
    expect(fmtSize(-1)).toBe("");
  });

  it("duração m:ss", () => {
    expect(fmtDuration(5)).toBe("0:05");
    expect(fmtDuration(65)).toBe("1:05");
    expect(fmtDuration(600)).toBe("10:00");
    expect(fmtDuration(null)).toBe("");
    expect(fmtDuration(undefined)).toBe("");
  });
});

describe("fileKind (espelha o servidor)", () => {
  it("aceita os suportados", () => {
    expect(fileKind("image/jpeg")).toBe("image");
    expect(fileKind("image/gif")).toBe("image");
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("audio/webm")).toBe("audio");
    expect(fileKind("application/pdf")).toBe("file");
  });

  it("recusa perigosos e desconhecidos", () => {
    expect(fileKind("image/svg+xml")).toBeNull();
    expect(fileKind("text/html")).toBeNull();
    expect(fileKind("application/x-msdownload")).toBeNull();
    expect(fileKind("application/javascript")).toBeNull();
    expect(fileKind("")).toBeNull();
  });
});
