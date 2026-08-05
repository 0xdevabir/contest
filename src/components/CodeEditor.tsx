"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";

const Monaco = dynamic(
  async () => {
    const mod = await import("@monaco-editor/react");
    // Load Monaco from our own origin. The package default is a jsDelivr CDN,
    // which the app's `script-src 'self'` CSP blocks, leaving the editor stuck
    // on its internal "Loading..." state. See scripts/copy-monaco.mjs.
    mod.loader.config({ paths: { vs: "/monaco/vs" } });
    return mod.default;
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[var(--bg-elevated)] font-mono text-sm text-[var(--muted)]">
        Loading editor…
      </div>
    ),
  }
);

type Props = {
  value: string;
  onChange: (value: string) => void;
  height?: string;
};

export function CodeEditor({ value, onChange, height = "100%" }: Props) {
  const { resolved } = useTheme();
  const [fontSize, setFontSize] = useState(14);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("diu_editor_font");
      const n = raw ? Number(raw) : 14;
      if (n >= 12 && n <= 20) setFontSize(n);
    } catch {
      /* ignore */
    }
  }, []);

  const handleMount: OnMount = (editor) => {
    editor.focus();
  };

  return (
    <Monaco
      height={height}
      language="c"
      theme={resolved === "light" ? "vs" : "vs-dark"}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      options={{
        fontFamily: "var(--font-mono), IBM Plex Mono, Menlo, monospace",
        fontSize,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        wordWrap: "on",
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
        smoothScrolling: true,
      }}
    />
  );
}
