"use client";

import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type IDisposable } from "@xterm/xterm";

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

const systemMonospaceFontStack =
  'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export function TerminalPane({ threadId, initialData, status }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const inputDisposableRef = useRef<IDisposable | null>(null);
  const initialDataRef = useRef(initialData);

  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  useEffect(() => {
    const container = containerRef.current;
    const desktop = window.desktop;

    if (!container || !desktop) {
      return;
    }

    const isMacOS = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: systemMonospaceFontStack,
      fontSize: 13,
      lineHeight: 1.35,
      macOptionIsMeta: isMacOS ? false : undefined,
      scrollback: 5000,
      theme: terminalTheme,
    });
    const fitAddon = new FitAddon();
    const altInputState = {
      handled: false,
      pending: false,
    };

    terminal.loadAddon(fitAddon);
    terminal.open(container);
    terminalRef.current = terminal;

    const textarea = terminal.textarea;
    const updateAltPending = (event: KeyboardEvent) => {
      altInputState.pending = isMacOS && event.altKey && !event.ctrlKey && !event.metaKey;

      if (!altInputState.pending) {
        altInputState.handled = false;
      }
    };
    const resetAltPending = () => {
      altInputState.pending = false;
      altInputState.handled = false;
    };
    const handleAltBeforeInput = (event: InputEvent) => {
      if (!altInputState.pending || event.isComposing) {
        return;
      }

      const text = event.data ?? "";

      if (!text || /[\u0000-\u001f\u007f]/.test(text)) {
        return;
      }

      event.preventDefault();
      altInputState.handled = true;
      altInputState.pending = false;
      if (textarea) {
        textarea.value = "";
      }
      void desktop.terminal.write(threadId, text);
    };
    const handleAltInput = (event: Event) => {
      if (!altInputState.pending || altInputState.handled) {
        return;
      }

      const target = event.currentTarget;

      if (!(target instanceof HTMLTextAreaElement)) {
        return;
      }

      const text = target.value;

      if (!text || /[\u0000-\u001f\u007f]/.test(text)) {
        return;
      }

      altInputState.pending = false;
      target.value = "";
      void desktop.terminal.write(threadId, text);
    };

    textarea?.addEventListener("keydown", updateAltPending);
    textarea?.addEventListener("keyup", resetAltPending);
    textarea?.addEventListener("blur", resetAltPending);
    textarea?.addEventListener("beforeinput", handleAltBeforeInput);
    textarea?.addEventListener("input", handleAltInput);
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        !isMacOS ||
        event.type !== "keydown" ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.key.length !== 1 ||
        /[\u0000-\u001f\u007f]/.test(event.key)
      ) {
        return true;
      }

      altInputState.handled = true;
      altInputState.pending = false;
      void desktop.terminal.write(threadId, event.key);
      event.preventDefault();
      return false;
    });

    if (initialDataRef.current) {
      // Reset attributes before replaying buffered output so a truncated ANSI sequence
      // does not leak broken colors into the restored prompt.
      terminal.write(`\u001b[0m${initialDataRef.current}`);
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
    terminal.focus();

    return () => {
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      disposeIncoming();
      textarea?.removeEventListener("keydown", updateAltPending);
      textarea?.removeEventListener("keyup", resetAltPending);
      textarea?.removeEventListener("blur", resetAltPending);
      textarea?.removeEventListener("beforeinput", handleAltBeforeInput);
      textarea?.removeEventListener("input", handleAltInput);
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [threadId]);

  useEffect(() => {
    const desktop = window.desktop;
    const terminal = terminalRef.current;

    inputDisposableRef.current?.dispose();
    inputDisposableRef.current = null;

    if (!desktop || !terminal || status !== "running") {
      return;
    }

    inputDisposableRef.current = terminal.onData((data) => {
      void desktop.terminal.write(threadId, data);
    });

    terminal.focus();

    return () => {
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
    };
  }, [status, threadId]);

  return <div ref={containerRef} className="h-full min-h-0 w-full" />;
}
