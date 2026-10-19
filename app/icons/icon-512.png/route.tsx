import { ImageResponse } from "next/og";

/** Ícone PWA 512px gerado da marca. */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(120deg, #C4B5FD 0%, #F5F2FB 35%, #F5F2FB 65%, #BAE6FD 100%)",
          borderRadius: 120,
        }}
      >
        <div style={{ position: "relative", width: 320, height: 320, display: "flex" }}>
          <div style={{ position: "absolute", left: 80, top: 74, width: 166, height: 166, borderRadius: 83, border: "30px solid #2E0F6B", background: "#F5F2FB" }} />
          <div style={{ position: "absolute", left: 6, top: 166, width: 118, height: 118, borderRadius: 59, border: "30px solid #2E0F6B", background: "#F5F2FB" }} />
          <div style={{ position: "absolute", left: 92, top: 140, width: 118, height: 60, borderTop: "30px solid #2E0F6B", borderTopLeftRadius: 60, borderTopRightRadius: 60, transform: "rotate(24deg)" }} />
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
