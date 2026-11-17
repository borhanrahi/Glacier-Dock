import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { appHue, initials } from "../utils/apps";

interface ProcessRow {
  pid: number;
  parentPid: number;
  name: string;
  cpuPercent: number;
  ramBytes: number;
  impact: "Low" | "Moderate" | "High";
  exePath: string | null;
  suspended: boolean;
}

interface Snapshot {
  processes: ProcessRow[];
  totalRam: number;
  usedRam: number;
}

interface PortEntry {
  port: number;
  address: string;
  pid: number;
  process: string;
}

interface StartupEntry {
  name: string;
  path: string;
  scope: string;
}

type Tab = "CPU" | "Memory" | "GPU & Energy" | "Startup & Ports";

const TABS: Tab[] = ["CPU", "Memory", "GPU & Energy", "Startup & Ports"];
const HISTORY = 60;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1_048_576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

export default function TaskManagerWindow() {
  const [tab, setTab] = useState<Tab>("CPU");
  const [snapshot, setSnapshot] = useState<Snapshot>({
    processes: [],
    totalRam: 0,
    usedRam: 0,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [startup, setStartup] = useState<StartupEntry[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [history, setHistory] = useState<{ cpu: number[]; ram: number[] }>({ cpu: [], ram: [] });
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<Snapshot>("process_snapshot");
      setSnapshot(next);
      const cpu = next.processes.reduce((sum, row) => sum + row.cpuPercent, 0);
      const ram = next.totalRam > 0 ? (next.usedRam / next.totalRam) * 100 : 0;
      setHistory((current) => ({
        cpu: [...current.cpu, cpu].slice(-HISTORY),
        ram: [...current.ram, ram].slice(-HISTORY),
      }));
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer.current);
  }, [refresh]);

  useEffect(() => {
    if (tab !== "Startup & Ports") return;
    invoke<PortEntry[]>("listening_ports").then(setPorts).catch(() => setPorts([]));
    invoke<StartupEntry[]>("startup_entries").then(setStartup).catch(() => setStartup([]));
  }, [tab]);

  const groups = useMemo(() => {
    const rows = snapshot.processes;
    const byPid = new Map(rows.map((row) => [row.pid, row]));
    const children = new Map<number, ProcessRow[]>();
    const roots: ProcessRow[] = [];

    for (const row of rows) {
      const parent = byPid.get(row.parentPid);
      if (parent) {
        const list = children.get(parent.pid) ?? [];
        list.push(row);
        children.set(parent.pid, list);
      } else {
        roots.push(row);
      }
    }

    const sortRows = (list: ProcessRow[]) => {
      const sorted = [...list];
      sorted.sort((a, b) =>
        tab === "Memory" ? b.ramBytes - a.ramBytes : b.cpuPercent - a.cpuPercent,
      );
      return sorted;
    };

    const ordered: Array<{ row: ProcessRow; depth: number }> = [];
    const push = (row: ProcessRow, depth: number) => {
      ordered.push({ row, depth });
      if (depth >= 3) return;
      for (const child of sortRows(children.get(row.pid) ?? [])) {
        if (expanded.includes(row.name)) push(child, depth + 1);
      }
    };
    for (const root of sortRows(roots)) push(root, 0);
    return ordered;
  }, [snapshot.processes, tab, expanded]);

  const action = async (kind: "kill" | "tree" | "suspend" | "resume" | "reveal") => {
    if (selected === null) return;
    try {
      if (kind === "kill") await invoke("kill_process", { pid: selected, tree: false });
      else if (kind === "tree") await invoke("kill_process", { pid: selected, tree: true });
      else if (kind === "suspend") await invoke("suspend_process", { pid: selected, suspend: true });
      else if (kind === "resume") await invoke("suspend_process", { pid: selected, suspend: false });
      else await invoke("reveal_process", { pid: selected });
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const killPort = async (entry: PortEntry) => {
    try {
      await invoke("kill_process", { pid: entry.pid, tree: false });
      setPorts((current) => current.filter((item) => item.port !== entry.port));
    } catch (err) {
      setError(String(err));
    }
  };

  const memoryPercent =
    snapshot.totalRam > 0 ? (snapshot.usedRam / snapshot.totalRam) * 100 : 0;

  return (
    <div className="glacier-dock-glass relative flex h-full w-full flex-col overflow-hidden rounded-[18px]">
      <span className="glacier-dock-sheen" aria-hidden />
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="text-xs font-semibold tracking-wide">Glacier Activity Monitor</span>
        <nav className="ml-3 flex gap-1">
          {TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setTab(entry)}
              className="rounded-full px-2.5 py-1 text-[10px] transition-colors"
              style={{
                background: entry === tab ? "var(--glacier-aurora-line)" : "rgba(255,255,255,0.08)",
                color: entry === tab ? "#08111d" : "inherit",
                fontWeight: entry === tab ? 600 : 400,
              }}
            >
              {entry}
            </button>
          ))}
        </nav>
        <span className="ml-auto text-[9px] tabular-nums opacity-50">
          {snapshot.processes.length} processes
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 px-4 py-2">
        <div>
          <div className="flex justify-between text-[9px] opacity-60">
            <span>CPU</span>
            <span className="tabular-nums">
              {history.cpu.length ? history.cpu[history.cpu.length - 1].toFixed(0) : 0}%
            </span>
          </div>
          <Sparkline values={history.cpu} color="var(--glacier-accent)" />
        </div>
        <div>
          <div className="flex justify-between text-[9px] opacity-60">
            <span>Memory</span>
            <span className="tabular-nums">{memoryPercent.toFixed(0)}%</span>
          </div>
          <Sparkline values={history.ram} color="#A78BFA" />
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded bg-red-500/15 px-2 py-1 text-[10px] text-red-200">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {tab === "GPU & Energy" ? (
          <div className="px-4 py-10 text-center text-[11px] leading-relaxed opacity-60">
            Per-process GPU and energy counters need ETW providers (D3DKMT + Energy
            Estimation), which land with the telemetry bus. Memory pressure, disk and
            network totals are already collected for the ribbon.
          </div>
        ) : tab === "Startup & Ports" ? (
          <div className="space-y-4 py-2">
            <section>
              <h3 className="px-2 pb-1 text-[10px] uppercase tracking-widest opacity-45">
                Localhost ports
              </h3>
              {ports.length === 0 && (
                <div className="px-2 py-2 text-[11px] opacity-50">No listening ports.</div>
              )}
              {ports.map((entry) => (
                <div
                  key={`${entry.port}-${entry.pid}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] hover:bg-white/5"
                >
                  <span className="w-14 tabular-nums opacity-80">:{entry.port}</span>
                  <span className="flex-1 truncate">{entry.process}</span>
                  <span className="text-[9px] opacity-40">{entry.address}</span>
                  <button
                    type="button"
                    onClick={() => killPort(entry)}
                    className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-medium text-red-200"
                  >
                    Kill
                  </button>
                </div>
              ))}
            </section>

            <section>
              <h3 className="px-2 pb-1 text-[10px] uppercase tracking-widest opacity-45">
                Startup entries
              </h3>
              {startup.map((entry) => (
                <div
                  key={entry.path}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] hover:bg-white/5"
                  title={entry.path}
                >
                  <span className="flex-1 truncate">{entry.name}</span>
                  <span className="text-[9px] uppercase opacity-40">{entry.scope}</span>
                  <button
                    type="button"
                    onClick={() => invoke("open_path", { path: entry.path }).catch(() => {})}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[9px]"
                  >
                    Open
                  </button>
                </div>
              ))}
              {startup.length === 0 && (
                <div className="px-2 py-2 text-[11px] opacity-50">No startup entries.</div>
              )}
            </section>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-0.5 text-left text-[11px]">
            <thead className="sticky top-0 bg-[var(--glacier-elevated)] text-[9px] uppercase tracking-wider opacity-50">
              <tr>
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="w-16 px-2 py-1 text-right font-medium">PID</th>
                <th className="w-16 px-2 py-1 text-right font-medium">CPU</th>
                <th className="w-20 px-2 py-1 text-right font-medium">Memory</th>
                <th className="w-20 px-2 py-1 text-right font-medium">Impact</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ row, depth }) => {
                const hasChildren = snapshot.processes.some(
                  (candidate) => candidate.parentPid === row.pid,
                );
                return (
                  <tr
                    key={`${row.pid}-${row.name}`}
                    onClick={() => setSelected(row.pid)}
                    className="cursor-default rounded"
                    style={{
                      background:
                        selected === row.pid ? "rgba(56,189,248,0.16)" : "transparent",
                    }}
                  >
                    <td className="px-2 py-1">
                      <div
                        className="flex items-center gap-1.5"
                        style={{ paddingLeft: depth * 12 }}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpanded((current) =>
                                current.includes(row.name)
                                  ? current.filter((name) => name !== row.name)
                                  : [...current, row.name],
                              );
                            }}
                            className="w-2.5 text-[9px] opacity-60"
                          >
                            {expanded.includes(row.name) ? "▾" : "▸"}
                          </button>
                        ) : (
                          <span className="w-2.5" />
                        )}
                        <span
                          className="grid size-4 shrink-0 place-items-center rounded text-[7px] font-bold"
                          style={{
                            background: `hsl(${appHue(row.name)} 65% 50% / 0.85)`,
                            color: "#08111d",
                          }}
                        >
                          {initials(row.name.replace(/\.exe$/i, ""))}
                        </span>
                        <span className="truncate">{row.name}</span>
                        {row.suspended && (
                          <span className="rounded bg-amber-400/20 px-1 text-[8px] text-amber-200">
                            suspended
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums opacity-60">{row.pid}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {row.cpuPercent.toFixed(1)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums opacity-80">
                      {formatBytes(row.ramBytes)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <span
                        className="rounded-full px-1.5 text-[8px]"
                        style={{
                          background:
                            row.impact === "High"
                              ? "rgba(248,113,113,0.2)"
                              : row.impact === "Moderate"
                                ? "rgba(250,204,21,0.18)"
                                : "rgba(52,211,153,0.18)",
                        }}
                      >
                        {row.impact}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <span className="mr-auto text-[9px] opacity-45">
          {selected ? `PID ${selected}` : "Select a process"}
        </span>
        <button
          type="button"
          disabled={selected === null}
          onClick={() => action("reveal")}
          className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] disabled:opacity-30"
        >
          Open file location
        </button>
        <button
          type="button"
          disabled={selected === null}
          onClick={() => action("suspend")}
          className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] disabled:opacity-30"
        >
          Suspend
        </button>
        <button
          type="button"
          disabled={selected === null}
          onClick={() => action("resume")}
          className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] disabled:opacity-30"
        >
          Resume
        </button>
        <button
          type="button"
          disabled={selected === null}
          onClick={() => action("kill")}
          className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] text-amber-100 disabled:opacity-30"
        >
          End task
        </button>
        <button
          type="button"
          disabled={selected === null}
          onClick={() => action("tree")}
          className="rounded-full bg-red-500/25 px-2.5 py-1 text-[10px] text-red-100 disabled:opacity-30"
        >
          End process tree
        </button>
      </footer>
    </div>
  );
}
