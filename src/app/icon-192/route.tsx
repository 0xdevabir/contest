import { ImageResponse } from "next/og";

export const runtime = "edge";

function icon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080b10",
          color: "#3ecf8e",
          fontSize: Math.round(size * 0.48),
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          borderRadius: Math.round(size * 0.18),
          border: `${Math.max(2, Math.round(size * 0.04))}px solid #3ecf8e`,
        }}
      >
        C
      </div>
    ),
    { width: size, height: size },
  );
}

export async function GET() {
  return icon(192);
}
