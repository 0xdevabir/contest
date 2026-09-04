import { describe, it, expect } from "vitest";
import { convertLatexToMarkdown } from "./latex";

describe("convertLatexToMarkdown", () => {
  it("converts \\textbf and \\textit to markdown emphasis", () => {
    const { markdown } = convertLatexToMarkdown("\\textbf{bold} and \\textit{italic}");
    expect(markdown).toBe("**bold** and *italic*");
  });

  it("converts itemize to a markdown list", () => {
    const { markdown } = convertLatexToMarkdown("\\begin{itemize}\\item one\\item two\\end{itemize}");
    expect(markdown).toBe("- one\n- two");
  });

  it("converts verbatim to a fenced code block", () => {
    const { markdown } = convertLatexToMarkdown("\\begin{verbatim}code here\\end{verbatim}");
    expect(markdown).toBe("```\ncode here\n```");
  });

  it("keeps math delimiters verbatim", () => {
    const { markdown } = convertLatexToMarkdown("Let $n \\le 10^5$ be the input size.");
    expect(markdown).toContain("$n \\le 10^5$");
  });

  it("leaves an unrecognised macro verbatim and reports a warning", () => {
    const { markdown, warnings } = convertLatexToMarkdown("\\somemacro{x} is unknown");
    expect(markdown).toContain("\\somemacro{x}");
    expect(warnings.some((w) => w.includes("\\somemacro"))).toBe(true);
  });
});
