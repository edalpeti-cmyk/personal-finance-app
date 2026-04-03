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
            width: 360,
            height: 360,
            borderRadius: 88,
            border: "2px solid rgba(255,255,255,0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 22px 60px rgba(2,8,23,0.45)",
            background: "rgba(255,255,255,0.04)"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-end" }}>
              <div style={{ width: 30, height: 120, borderRadius: 18, background: "#34d399" }} />
              <div style={{ width: 30, height: 170, borderRadius: 18, background: "#5eead4" }} />
              <div style={{ width: 30, height: 90, borderRadius: 18, background: "#93c5fd" }} />
            </div>
            <div
              style={{
                fontSize: 78,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: "white"
              }}
            >
              F
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
