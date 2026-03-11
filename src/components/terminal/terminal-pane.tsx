"use client";

import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import type { ThreadStatus } from "@/lib/workspace-types";

interface TerminalPaneProps {
  threadId: string;
  initialData: string;
  status: ThreadStatus;
}

const terminalTheme = {
  background: "#08111f",
  foreground: "#e5eef7",
  cursor: "#7dd3fc",
  black: "#112033",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#f472b6",
  cyan: "#22d3ee",
  white: "#dbe7f3",
  brightBlack: "#36506e",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#f9a8d4",
  brightCyan: "#67e8f9",
  brightWhite: "#f8fbff",
};

export function TerminalPane({ threadId, initialData, status }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const desktop = window.desktop;

    if (!container || !desktop) {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "var(--font-mono), 'SFMono-Regular', monospace",
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: terminalTheme,
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(container);

    if (initialData) {
      terminal.write(initialData);
    }

    const syncSize = () => {
      fitAddon.fit();
      void desktop.terminal.resize(threadId, terminal.cols, terminal.rows);
    };

    const frame = window.requestAnimationFrame(syncSize);
    const resizeObserver = new ResizeObserver(() => syncSize());
    resizeObserver.observe(container);

    const disposeIncoming = desktop.terminal.onData(({ threadId: incomingThreadId, data }) => {
      if (incomingThreadId === threadId) {
        terminal.write(data);
      }
    });

    const inputDisposable =
      status === "running"
        ? terminal.onData((data) => {
            void desktop.terminal.write(threadId, data);
          })
        : null;

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      disposeIncoming();
      inputDisposable?.dispose();
      terminal.dispose();
    };
  }, [initialData, status, threadId]);

  return <div ref={containerRef} className="h-full min-h-0 w-full" />;
}
