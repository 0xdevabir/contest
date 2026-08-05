import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { THEMES } from "@/lib/theme";

const P = THEMES.dark.palette;

export const runtime = "edge";
export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(135deg, ${P.bg} 0%, ${P.bgPanel} 60%, ${P.bg} 100%)`,
          color: P.text,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "12px",
              background: P.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: P.accentContrast,
              fontSize: "28px",
              fontWeight: 800,
            }}
          >
            C
          </div>
          <div style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.5px" }}>
            {BRAND.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              fontSize: "70px",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-2px",
              maxWidth: "1000px",
            }}
          >
            Practice C. Compete live. Get judged in milliseconds.
          </div>
          <div
            style={{
              fontSize: "26px",
              color: P.muted,
              maxWidth: "900px",
              lineHeight: 1.4,
            }}
          >
            700 exam-style C problems · Instant AC/WA/TLE verdicts · Live
            inter-university contests between DIU, NSU, AIUB, and BRAC.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: P.mutedDim,
            fontSize: "20px",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <span>DIU · NSU · AIUB · BRAC</span>
          <span>{new URL(BRAND.siteUrl).host}</span>
        </div>
      </div>
    ),
    size,
  );
}

