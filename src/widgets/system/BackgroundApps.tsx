import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, X } from "lucide-react";
import { MiniButton, WidgetFrame } from "../kit";
import { useAppIcon } from "../../sdk/hooks";

interface TrayApp {
  pid: number;
  name: string;
  exePath: string | null;
  hwnd: number;
}

function TrayIcon({ path, name }: { path: string | null; name: string }) {
  const icon = useAppIcon(path);
  if (icon) {
    return <img src={icon} alt="" draggable={false} className="size-5 shrink-0 object-contain" />;
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded bg-white/10 text-[9px] font-semibold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function BackgroundApps() {
  const [apps, setApps] = useState<TrayApp[]>([]);

  const load = useCallback(() => {
    invoke<TrayApp[]>("tray_apps")
      .then((list) => setApps(Array.isArray(list) ? list : []))
      .catch(() => setApps([]));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <WidgetFrame title="Hidden Apps" live hint={`${apps.length} in tray`}>
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] opacity-55">Windows tray overflow</span>
          <MiniButton onClick={load}>Refresh</MiniButton>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          {apps.length === 0 && (
            <div className="grid h-full place-items-center px-3 text-center text-[10px] leading-relaxed opacity-55">
              No apps are currently minimized to the Windows tray.
            </div>
          )}
          {apps.map((app) => (
            <div
              key={`${app.pid}-${app.exePath ?? app.name}`}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[10px] hover:bg-white/10"
            >
              <TrayIcon path={app.exePath} name={app.name} />
              <span className="min-w-0 flex-1 truncate font-medium" title={app.exePath ?? undefined}>
                {app.name}
              </span>
              <button
                type="button"
                title="Reveal in Explorer"
                onClick={() => invoke("reveal_process", { pid: app.pid }).catch(() => {})}
                className="rounded p-1 opacity-65 hover:bg-white/15 hover:opacity-100"
              >
                <FolderOpen className="size-3" />
              </button>
              <button
                type="button"
                title="Close app"
                onClick={() =>
                  invoke("kill_process", { pid: app.pid, tree: false })
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
