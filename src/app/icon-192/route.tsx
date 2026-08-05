import { ImageResponse } from "next/og";
import { THEMES } from "@/lib/theme";

const P = THEMES.dark.palette;

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
          background: P.bg,
          color: P.accent,
          fontSize: Math.round(size * 0.48),
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          borderRadius: Math.round(size * 0.18),
          border: `${Math.max(2, Math.round(size * 0.04))}px solid ${P.accent}`,
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
