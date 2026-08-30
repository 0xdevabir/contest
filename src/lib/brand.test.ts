import { describe, it, expect, beforeEach, vi } from "vitest";

describe("BRAND.siteUrl resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_APP_URL when it is a real domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com/");
    vi.stubEnv("APP_URL", "");
    const { BRAND } = await import("./brand");
    expect(BRAND.siteUrl).toBe("https://example.com");
  });

  it("falls back to APP_URL when NEXT_PUBLIC_APP_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("APP_URL", "https://staging.example.com");
    const { BRAND } = await import("./brand");
    expect(BRAND.siteUrl).toBe("https://staging.example.com");
  });

  it("never ships localhost into siteUrl in production", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const { BRAND } = await import("./brand");
    expect(BRAND.siteUrl).toBe(BRAND.productionSiteUrl);
  });

  it("falls back to localhost outside production with no configured URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    const { BRAND } = await import("./brand");
    expect(BRAND.siteUrl).toBe("http://localhost:3000");
  });
});
