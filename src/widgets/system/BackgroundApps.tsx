import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useAppIcon } from "../../sdk/hooks";

interface TrayApp {
  pid: number;
  name: string;
  exePath: string | null;
  hwnd: number;
}

function appKey(app: TrayApp): string {
  return (app.exePath ?? app.name).toLowerCase();
}

const closeHost = () => invoke("dismiss_host_window").catch(() => {});

/** Plain shell icon, like Windows draws in the tray overflow list. */
function SmallIcon({ path, name }: { path: string | null; name: string }) {
  const icon = useAppIcon(path);
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        draggable={false}
        className="size-5 shrink-0 select-none object-contain"
      />
    );
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded bg-white/10 text-[9px] font-semibold opacity-70">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function BackgroundApps() {
  const [apps, setApps] = useState<TrayApp[]>([]);

  const load = useCallback(() => {
    invoke<TrayApp[]>("tray_apps")
      .then((list) => {
        if (!Array.isArray(list)) {
          setApps([]);
          return;
        }
        setApps((prev) => {
          const byKey = new Map(list.map((item) => [appKey(item), item]));
          const kept = prev
            .map((item) => byKey.get(appKey(item)))
            .filter((item): item is TrayApp => item !== undefined);
          const keptKeys = new Set(kept.map(appKey));
          const next = [...kept, ...list.filter((item) => !keptKeys.has(appKey(item)))];
          if (
            next.length === prev.length &&
            next.every((item, idx) => item.pid === prev[idx].pid && item.hwnd === prev[idx].hwnd)
          ) {
            return prev;
          }
          return next;
        });
      })
      .catch(() => setApps([]));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [load]);

  const restore = (app: TrayApp) => {
    invoke("restore_tray_app", {
      pid: app.pid,
      hwnd: app.hwnd,
      exePath: app.exePath,
    }).catch(() => {});
    closeHost();
  };

  return (
    <div className="glacier-panel-glass relative flex h-full w-full flex-col overflow-hidden rounded-2xl">
      <span className="glacier-dock-sheen" aria-hidden />

      <header
        data-tauri-drag-region
        className="relative flex cursor-move items-center gap-2 border-b border-white/[0.07] px-3 py-2"
      >
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[11px] font-semibold">Hidden icons</span>
          <span className="block text-[9px] uppercase tracking-[0.12em] opacity-40">
            Minimized &amp; tray
          </span>
        </span>
        <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] tabular-nums opacity-60">
          {apps.length}
        </span>
        <button
          type="button"
          title="Close"
          onClick={closeHost}
          className="grid size-5 place-items-center rounded text-[12px] opacity-50 transition hover:bg-white/10 hover:opacity-100"
        >
          ×
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-1.5">
        {apps.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-[11px] opacity-45">
            No hidden icons
          </div>
        ) : (
          <div className="space-y-0.5">
            {apps.map((app) => (
              <button
                key={appKey(app)}
                type="button"
                title={`Restore ${app.name}`}
                onClick={() => restore(app)}
                className="flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.09] active:bg-white/[0.14]"
              >
                <SmallIcon path={app.exePath} name={app.name} />
                <span className="min-w-0 flex-1 truncate opacity-90">{app.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="relative border-t border-white/[0.06] px-3 py-1.5 text-[9px] opacity-35">
        Click an icon to restore it
      </footer>
    </div>
  );
}
