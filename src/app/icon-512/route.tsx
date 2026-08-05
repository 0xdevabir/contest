import { ImageResponse } from "next/og";
import { THEMES } from "@/lib/theme";

const P = THEMES.dark.palette;

export const runtime = "edge";

export async function GET() {
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
          fontSize: 240,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          borderRadius: 92,
          border: `20px solid ${P.accent}`,
        }}
      >
        C
      </div>
    ),
    { width: 512, height: 512 },
  );
}

