/**
 * Glacier Terminal — a glass command console for the dock.
 *
 * Commands run in a hidden CMD / PowerShell process through `terminal_exec`.
 * The backend appends a sentinel to every command so the resulting directory
 * is reported back; that makes `cd` persist between lines without keeping a
 * visible console window around.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";

import { TerminalIcon } from "../components/DockIcons";
import { MAC_MODAL_SPRING, useWindowMotion } from "../sdk/motion";

type LineKind = "prompt" | "output" | "muted" | "error";
interface Line {
  id: number;
  kind: LineKind;
  text: string;
}

type Shell = "cmd" | "powershell";

const BANNER: Line[] = [
  { id: 0, kind: "muted", text: "Glacier Terminal  ·  type help for commands" },
  { id: 1, kind: "muted", text: "────────────────────────────────────────────────────" },
];

export default function TerminalWindow() {
  const { showSeq, visible, dismiss } = useWindowMotion();
  const [lines, setLines] = useState<Line[]>(BANNER);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("");
  const [shell, setShell] = useState<Shell>("cmd");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const idRef = useRef(2);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const append = useCallback((kind: LineKind, text: string) => {
    setLines((current) => [...current, { id: idRef.current++, kind, text }]);
  }, []);

  useEffect(() => {
    invoke<string>("terminal_cwd")
      .then((dir) => setCwd(dir || ""))
      .catch(() => setCwd(""));
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines, busy]);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible, showSeq]);

  const run = async () => {
    const command = input.trim();
    setInput("");
    setHistoryIndex(-1);
    if (!command || busy) {
      append("prompt", `${cwd}> `);
      return;
    }
    setHistory((current) => [...current, command].slice(-100));
    append("prompt", `${cwd}> ${command}`);

    if (command.toLowerCase() === "cls" || command.toLowerCase() === "clear") {
      setLines([]);
      return;
    }
    if (command.toLowerCase() === "exit") {
      dismiss();
      return;
    }
    if (command.toLowerCase() === "help") {
      append(
        "muted",
        "Commands run in a hidden shell. cd persists.  cls / clear · exit · help · history · shell cmd|powershell",
      );
      return;
    }
    if (command.toLowerCase() === "history") {
      history.forEach((entry, index) => append("muted", `${index + 1}  ${entry}`));
      return;
    }
    if (/^shell\s+(cmd|powershell|ps)$/i.test(command)) {
      const next = command.split(/\s+/)[1].toLowerCase() === "cmd" ? "cmd" : "powershell";
      setShell(next);
      append("muted", `Shell switched to ${next === "cmd" ? "Command Prompt" : "PowerShell"}.`);
      return;
    }

    setBusy(true);
    try {
      const result = await invoke<{ output: string; cwd: string; code: number }>("terminal_exec", {
        command,
        cwd,
        shell,
      });
      if (result?.cwd) setCwd(result.cwd);
      if (result?.output) {
        result.output.split(/\r?\n/).forEach((line) => {
          if (line.length) append(result.code !== 0 ? "error" : "output", line);
        });
      }
      if (result?.code !== 0 && !result?.output) {
        append("error", `Command exited with code ${result?.code ?? 1}.`);
      }
    } catch (error) {
      append("error", String(error));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void run();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!history.length) return;
      const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setInput(history[next]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex < 0) return;
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(-1);
        setInput("");
      } else {
        setHistoryIndex(next);
        setInput(history[next]);
      }
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      setLines([]);
    } else if (event.key === "c" && event.ctrlKey && input) {
      event.preventDefault();
      append("muted", `${cwd}> ${input}^C`);
      setInput("");
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={showSeq}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.09 } }}
          transition={MAC_MODAL_SPRING}
          className="relative h-full w-full will-change-transform"
        >
          <div className="glacier-panel-glass relative flex h-full w-full flex-col overflow-hidden rounded-[18px]">
        <span className="glacier-dock-sheen" aria-hidden />

        <header
          data-tauri-drag-region
          className="relative flex cursor-move items-center gap-2.5 border-b border-white/[0.07] px-3.5 py-2.5"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-sky-400/25 to-indigo-500/20 p-1">
            <TerminalIcon />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="truncate text-[12px] font-semibold tracking-wide">Glacier Terminal</h2>
            <p className="text-[9px] uppercase tracking-[0.14em] opacity-45">
              {shell === "cmd" ? "Command Prompt" : "PowerShell"}
            </p>
          </div>
          <div className="flex rounded-lg bg-black/25 p-0.5 text-[9px]">
            {(["cmd", "powershell"] as Shell[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setShell(option)}
                className={`rounded-md px-2 py-1 transition ${
                  shell === option
                    ? "bg-[var(--glacier-accent)]/25 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {option === "cmd" ? "CMD" : "PS"}
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Close"
            onClick={dismiss}
            className="grid size-6 place-items-center rounded-full text-[13px] text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </header>

        <div
          ref={scrollRef}
          onClick={() => inputRef.current?.focus()}
          className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-[1.55]"
        >
          {lines.map((line) => (
            <div
              key={line.id}
              className={`whitespace-pre-wrap break-all ${
                line.kind === "prompt"
                  ? "text-sky-300"
                  : line.kind === "error"
                    ? "text-rose-300"
                    : line.kind === "muted"
                      ? "text-slate-500"
                      : "text-slate-200/90"
              }`}
            >
              {line.text || "\u00a0"}
            </div>
          ))}
          <div className="flex items-center gap-1.5 whitespace-pre">
            <span className="shrink-0 text-sky-300">{cwd}&gt;</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              aria-label="Terminal command"
              className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[11px] text-slate-100 caret-[var(--glacier-accent)] outline-none focus:outline-none focus:ring-0"
            />
          </div>
          {busy && <div className="mt-1 text-[9px] text-slate-500">running…</div>}
        </div>

        <footer className="relative flex items-center gap-2 border-t border-white/[0.07] px-3.5 py-1.5 font-mono text-[9px] text-slate-500">
          <span className="size-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]" />
          <span className="min-w-0 flex-1 truncate">{cwd}</span>
          <span>↑↓ history · Ctrl+L clear</span>
        </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
