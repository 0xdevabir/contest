"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BeforeMount, Monaco as MonacoApi, OnMount } from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";

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

const editorThemeName = (theme: Theme) => `contesthub-${theme.id}`;

/** Monaco wants bare hex for token rules and `#rrggbb` for workbench colours. */
const bare = (hex: string) => hex.replace("#", "");

function defineEditorTheme(monaco: MonacoApi, theme: Theme) {
  const p = theme.palette;
  monaco.editor.defineTheme(editorThemeName(theme), {
    base: theme.editorBase,
    inherit: true,
    rules: [
      { token: "comment", foreground: bare(p.mutedDim), fontStyle: "italic" },
      { token: "keyword", foreground: bare(p.diff[6]) },
      { token: "string", foreground: bare(p.diff[0]) },
      { token: "number", foreground: bare(p.warn) },
      { token: "type", foreground: bare(p.info) },
      { token: "type.identifier", foreground: bare(p.info) },
      { token: "delimiter", foreground: bare(p.muted) },
      { token: "identifier", foreground: bare(p.text) },
    ],
    colors: {
      "editor.background": p.bgElevated,
      "editor.foreground": p.text,
      "editorLineNumber.foreground": p.mutedDim,
      "editorLineNumber.activeForeground": p.muted,
      "editorCursor.foreground": p.accent,
      "editor.selectionBackground": p.lineStrong,
      "editor.lineHighlightBackground": p.bgPanel,
      "editorIndentGuide.background1": p.lineSoft,
      "editorIndentGuide.activeBackground1": p.line,
      "editorWhitespace.foreground": p.lineSoft,
      "editorWidget.background": p.bgPanel,
      "editorWidget.border": p.line,
      "editorSuggestWidget.background": p.bgPanel,
      "editorSuggestWidget.border": p.line,
      "editorSuggestWidget.selectedBackground": p.line,
      "scrollbarSlider.background": p.line,
      "scrollbarSlider.hoverBackground": p.lineStrong,
      "scrollbarSlider.activeBackground": p.lineStrong,
    },
  });
}

export function CodeEditor({ value, onChange, height = "100%" }: Props) {
  const { theme } = useTheme();
  const [fontSize, setFontSize] = useState(14);
  const monacoRef = useRef<MonacoApi | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("diu_editor_font");
      const n = raw ? Number(raw) : 14;
      if (n >= 12 && n <= 20) setFontSize(n);
    } catch {
      /* ignore */
    }
  }, []);

  // Re-register on every theme change: `defineTheme` is idempotent and the
  // editor may already be mounted when the user switches.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    defineEditorTheme(monaco, theme);
    monaco.editor.setTheme(editorThemeName(theme));
  }, [theme]);

  const handleBeforeMount: BeforeMount = useCallback(
    (monaco) => {
      monacoRef.current = monaco;
      defineEditorTheme(monaco, theme);
    },
    [theme]
  );

  const handleMount: OnMount = (editor) => {
    editor.focus();
  };

  return (
    <Monaco
      height={height}
      language="c"
      theme={editorThemeName(theme)}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      beforeMount={handleBeforeMount}
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
