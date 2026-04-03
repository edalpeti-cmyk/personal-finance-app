import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(180deg, rgba(9,20,38,1) 0%, rgba(12,27,49,1) 62%, rgba(10,63,70,1) 100%)"
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: 210,
            background: "radial-gradient(circle, rgba(52,211,153,0.22) 0%, rgba(52,211,153,0) 70%)",
            filter: "blur(8px)"
          }}
        />
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 88,
            border: "2px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 22px 60px rgba(2,8,23,0.45)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
              <div style={{ width: 34, height: 124, borderRadius: 18, background: "linear-gradient(180deg,#34d399 0%,#0f766e 100%)" }} />
              <div style={{ width: 34, height: 182, borderRadius: 18, background: "linear-gradient(180deg,#6ee7b7 0%,#14b8a6 100%)" }} />
              <div style={{ width: 34, height: 102, borderRadius: 18, background: "linear-gradient(180deg,#93c5fd 0%,#2563eb 100%)" }} />
            </div>
            <div
              style={{
                fontSize: 54,
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.92)"
              }}
            >
              FINANCE
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
