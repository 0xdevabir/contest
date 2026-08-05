import type { NextConfig } from "next";

// The interactive terminal opens a WebSocket to the runner, which is a separate
// origin, so it has to be allowed explicitly alongside 'self'.
const runnerOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_RUNNER_URL?.trim();
  if (!raw) return "";
  try {
    const { host, protocol } = new URL(raw);
    const secure = protocol === "https:" || protocol === "wss:";
    return ` ${secure ? "https" : "http"}://${host} ${secure ? "wss" : "ws"}://${host}`;
  } catch {
    return "";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${runnerOrigin}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Faster cold compiles + smaller client bundles for icon-heavy UI.
  experimental: {
    optimizePackageImports: ["lucide-react"],
    viewTransition: true,
  },
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Monaco is many small files; without this the browser revalidates every
        // one on each page load. Not immutable, so a version bump still lands.
        source: "/monaco/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
      {
        source: "/llms.txt",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        source: "/icon-192",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
      {
        source: "/icon-512",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;



