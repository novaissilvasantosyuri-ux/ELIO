import { ImageResponse } from "next/og";

/** Ícone PWA 192px gerado da marca (sem arquivos binários no repo). */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(120deg, #C4B5FD 0%, #F5F2FB 35%, #F5F2FB 65%, #BAE6FD 100%)",
          borderRadius: 44,
        }}
      >
        <div style={{ position: "relative", width: 120, height: 120, display: "flex" }}>
          <div style={{ position: "absolute", left: 30, top: 28, width: 62, height: 62, borderRadius: 31, border: "11px solid #2E0F6B", background: "#F5F2FB" }} />
          <div style={{ position: "absolute", left: 8, top: 66, width: 40, height: 40 }} />
          <div style={{ position: "absolute", left: 2, top: 62, width: 44, height: 44, borderRadius: 22, border: "11px solid #2E0F6B", background: "#F5F2FB" }} />
          <div style={{ position: "absolute", left: 34, top: 52, width: 44, height: 22, borderTop: "11px solid #2E0F6B", borderTopLeftRadius: 22, borderTopRightRadius: 22, transform: "rotate(24deg)" }} />
        </div>
      </div>
    ),
    { width: 192, height: 192 },
  );
}
