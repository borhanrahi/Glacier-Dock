import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, X } from "lucide-react";
import { MiniButton, WidgetFrame, bytes } from "../kit";
import { useAppIcon } from "../../sdk/hooks";

interface ProcEntry {
  pid: number;
  name: string;
  ramBytes: number;
  exePath: string | null;
}

function ProcIcon({ path }: { path: string | null }) {
  const icon = useAppIcon(path);
  if (icon) {
    return <img src={icon} alt="" draggable={false} className="size-5 shrink-0 object-contain" />;
  }
  return <span className="size-5 shrink-0 rounded bg-white/10" />;
}

export default function BackgroundApps() {
  const [procs, setProcs] = useState<ProcEntry[]>([]);

  const load = useCallback(() => {
    invoke<{ processes: ProcEntry[] }>("process_snapshot")
      .then((snap) => {
        if (!snap?.processes) return;
        const unique = new Map<string, ProcEntry>();
        for (const p of snap.processes) {
          if (!p.exePath) continue;
          const key = p.exePath.toLowerCase();
          if (!unique.has(key)) unique.set(key, p);
        }
        setProcs(Array.from(unique.values()).slice(0, 24));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <WidgetFrame title="Background Apps" live hint={`${procs.length} active`}>
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex justify-end">
          <MiniButton onClick={load}>Refresh</MiniButton>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          {procs.map((p) => (
            <div
              key={p.pid}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[10px] hover:bg-white/10"
            >
              <ProcIcon path={p.exePath} />
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="shrink-0 tabular-nums opacity-55">{bytes(p.ramBytes)}</span>
              <button
                type="button"
                title="Reveal in Explorer"
                onClick={() => invoke("reveal_process", { pid: p.pid }).catch(() => {})}
                className="rounded p-1 opacity-65 hover:bg-white/15 hover:opacity-100"
              >
                <FolderOpen className="size-3" />
              </button>
              <button
                type="button"
                title="End process"
                onClick={() =>
                  invoke("kill_process", { pid: p.pid, tree: false })
                    .then(load)
                    .catch(() => {})
                }
                className="rounded p-1 text-rose-300 opacity-75 hover:bg-rose-500/20 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
