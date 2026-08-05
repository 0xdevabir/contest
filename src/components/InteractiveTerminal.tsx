"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "@/components/ThemeProvider";

export type TerminalHandle = {
  run: (code: string) => void;
  stop: () => void;
};

type Props = {
  timeLimitMs: number;
  onRunningChange?: (running: boolean) => void;
};

type Phase = "idle" | "connecting" | "compiling" | "running";

export const InteractiveTerminal = forwardRef<TerminalHandle, Props>(
  function InteractiveTerminal({ timeLimitMs, onRunningChange }, ref) {
    const { theme } = useTheme();
    // Read inside effects without making them depend on the object identity.
    const paletteRef = useRef(theme.terminal);
    paletteRef.current = theme.terminal;
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [ready, setReady] = useState(false);

    const setRunning = useCallback(
      (p: Phase) => {
        setPhase(p);
        onRunningChange?.(p === "compiling" || p === "running" || p === "connecting");
      },
      [onRunningChange]
    );

    // xterm touches `window` at import time, so it can only load in the browser.
    useEffect(() => {
      let disposed = false;
      let onResize: (() => void) | null = null;

      (async () => {
        const [{ Terminal: XTerm }, { FitAddon: Fit }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed || !hostRef.current) return;

        const term = new XTerm({
          convertEol: false,
          cursorBlink: true,
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          theme: paletteRef.current,
          scrollback: 5000,
        });
        const fit = new Fit();
        term.loadAddon(fit);
        term.open(hostRef.current);
        fit.fit();

        term.writeln("\x1b[90mReady. Press Run to compile and execute.\x1b[0m");

        term.onData((data) => {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            // Ctrl+C stops the program rather than being delivered as input.
            if (data === "\u0003") ws.send(JSON.stringify({ type: "kill" }));
            else ws.send(JSON.stringify({ type: "stdin", data }));
          }
        });

        termRef.current = term;
        fitRef.current = fit;
        setReady(true);

        onResize = () => {
          try {
            fit.fit();
          } catch {
            // fit throws if the element is hidden; harmless
          }
        };
        window.addEventListener("resize", onResize);
      })();

      return () => {
        disposed = true;
        if (onResize) window.removeEventListener("resize", onResize);
        wsRef.current?.close();
        termRef.current?.dispose();
        termRef.current = null;
      };
    }, []);

    // Repaint an already-open terminal when the user switches theme.
    useEffect(() => {
      const term = termRef.current;
      if (term) term.options.theme = theme.terminal;
    }, [theme]);

    const stop = useCallback(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "kill" }));
      }
    }, []);

    const run = useCallback(
      async (code: string) => {
        const term = termRef.current;
        if (!term) return;

        wsRef.current?.close();
        term.reset();
        term.focus();
        setRunning("connecting");

        let ticket: string;
        let url: string;
        try {
          const res = await fetch("/api/run-ticket", { method: "POST" });
          const data = (await res.json()) as {
            ok: boolean;
            ticket?: string;
            url?: string;
            message?: string;
          };
          if (!data.ok || !data.ticket || !data.url) {
            term.writeln(`\x1b[31m${data.message ?? "Runner unavailable."}\x1b[0m`);
            setRunning("idle");
            return;
          }
          ticket = data.ticket;
          url = data.url;
        } catch {
          term.writeln("\x1b[31mCould not reach the server.\x1b[0m");
          setRunning("idle");
          return;
        }

        const wsBase = url.replace(/^http/, "ws").replace(/\/+$/, "");
        const ws = new WebSocket(`${wsBase}/ws?ticket=${encodeURIComponent(ticket)}`);
        wsRef.current = ws;

        ws.onopen = () => ws.send(JSON.stringify({ type: "run", code, timeLimitMs }));

        ws.onmessage = (ev) => {
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(ev.data as string);
          } catch {
            return;
          }

          switch (msg.type) {
            case "status":
              if (msg.phase === "compiling") {
                setRunning("compiling");
                term.writeln("\x1b[90mCompiling…\x1b[0m");
              } else if (msg.phase === "running") {
                setRunning("running");
              }
              break;

            case "compile": {
              const output = String(msg.output || "");
              if (!msg.ok) {
                term.writeln("\x1b[31mCompilation failed\x1b[0m\r\n");
                term.write(output.replace(/\n/g, "\r\n"));
                setRunning("idle");
              } else if (output.trim()) {
                term.writeln("\x1b[33mWarnings:\x1b[0m");
                term.write(output.replace(/\n/g, "\r\n"));
                term.writeln("");
              }
              break;
            }

            case "out":
              term.write(String(msg.data ?? ""));
              break;

            case "exit": {
              const code = msg.code as number | null;
              term.writeln("");
              if (msg.timedOut) {
                term.writeln(`\x1b[31m[time limit exceeded after ${timeLimitMs}ms]\x1b[0m`);
              } else if (code === 0) {
                term.writeln(`\x1b[90m[finished in ${msg.ms}ms]\x1b[0m`);
              } else {
                term.writeln(`\x1b[31m[exited with code ${code} after ${msg.ms}ms]\x1b[0m`);
              }
              setRunning("idle");
              ws.close();
              break;
            }

            case "error":
              term.writeln(`\x1b[31m${String(msg.message)}\x1b[0m`);
              setRunning("idle");
              break;
          }
        };

        ws.onerror = () => {
          term.writeln("\x1b[31mConnection to the runner failed.\x1b[0m");
          setRunning("idle");
        };

        ws.onclose = () => {
          if (wsRef.current === ws) wsRef.current = null;
          setRunning("idle");
        };
      },
      [setRunning, timeLimitMs]
    );

    useImperativeHandle(ref, () => ({ run, stop }), [run, stop]);

    // Refit whenever the panel becomes visible or changes size.
    useEffect(() => {
      if (!ready || !hostRef.current) return;
      const obs = new ResizeObserver(() => {
        try {
          fitRef.current?.fit();
        } catch {
          // ignore transient zero-size layouts
        }
      });
      obs.observe(hostRef.current);
      return () => obs.disconnect();
    }, [ready]);

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
            terminal
          </span>
          <span className="font-mono text-[10px] text-[var(--muted)]">
            {phase === "idle" && "idle"}
            {phase === "connecting" && "connecting…"}
            {phase === "compiling" && "compiling…"}
            {phase === "running" && (
              <span className="text-[var(--accent)]">running · Ctrl+C to stop</span>
            )}
          </span>
        </div>
        <div ref={hostRef} className="min-h-[200px] flex-1 overflow-hidden px-2 py-1" />
      </div>
    );
  }
);

