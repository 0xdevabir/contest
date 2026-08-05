import { ImageResponse } from "next/og";

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
          background: "#080b10",
          color: "#3ecf8e",
          fontSize: 240,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          borderRadius: 92,
          border: "20px solid #3ecf8e",
        }}
      >
        C
      </div>
    ),
    { width: 512, height: 512 },
  );
}
