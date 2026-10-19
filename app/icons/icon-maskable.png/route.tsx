import { ImageResponse } from "next/og";

/** Ícone maskable 512px (marca centralizada com área de segurança). */
export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F2FB" }}>
        <div
          style={{
            width: 380, height: 380, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(120deg, #C4B5FD 0%, #F5F2FB 40%, #F5F2FB 60%, #BAE6FD 100%)",
            borderRadius: 120,
          }}
        >
          <div style={{ position: "relative", width: 230, height: 230, display: "flex" }}>
            <div style={{ position: "absolute", left: 58, top: 52, width: 120, height: 120, borderRadius: 60, border: "22px solid #2E0F6B", background: "#F5F2FB" }} />
            <div style={{ position: "absolute", left: 4, top: 118, width: 86, height: 86, borderRadius: 43, border: "22px solid #2E0F6B", background: "#F5F2FB" }} />
            <div style={{ position: "absolute", left: 66, top: 100, width: 86, height: 44, borderTop: "22px solid #2E0F6B", borderTopLeftRadius: 44, borderTopRightRadius: 44, transform: "rotate(24deg)" }} />
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
