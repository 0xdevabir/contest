import { ImageResponse } from "next/og";
import { THEMES } from "@/lib/theme";

const P = THEMES.dark.palette;

export const runtime = "edge";
export const size = { width: 180, height: 180 };
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
          background: P.bg,
          color: P.accent,
          fontSize: "120px",
          fontWeight: 800,
        }}
      >
        C
      </div>
    ),
    size,
  );
}
