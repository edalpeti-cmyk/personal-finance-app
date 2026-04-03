import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon() {
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
            width: 126,
            height: 126,
            borderRadius: 34,
            border: "2px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)"
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 12, height: 42, borderRadius: 8, background: "linear-gradient(180deg,#34d399 0%,#0f766e 100%)" }} />
            <div style={{ width: 12, height: 60, borderRadius: 8, background: "linear-gradient(180deg,#6ee7b7 0%,#14b8a6 100%)" }} />
            <div style={{ width: 12, height: 32, borderRadius: 8, background: "linear-gradient(180deg,#93c5fd 0%,#2563eb 100%)" }} />
          </div>
        </div>
      </div>
    ),
    size
  );
}
