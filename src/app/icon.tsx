import { ImageResponse } from "next/og";
import { THEMES } from "@/lib/theme";

const P = THEMES.dark.palette;

export const runtime = "edge";
export const size = { width: 32, height: 32 };
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
          background: P.accent,
          color: P.accentContrast,
          fontSize: "22px",
          fontWeight: 800,
          borderRadius: "6px",
        }}
      >
        C
      </div>
    ),
    size,
  );
}
