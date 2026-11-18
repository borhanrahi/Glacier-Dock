import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, ExternalLink, X } from "lucide-react";

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

function TrayIcon({ path, name }: { path: string | null; name: string }) {
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
    <span className="grid size-5 shrink-0 place-items-center rounded bg-white/10 text-[9px] font-semibold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function BackgroundApps() {
  const [apps, setApps] = useState<TrayApp[]>([]);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);

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
          const added = list.filter((item) => !keptKeys.has(appKey(item)));
          const next = [...kept, ...added];
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
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, [load]);

  const selected = menuKey ? apps.find((app) => appKey(app) === menuKey) ?? null : null;

  const restoreApp = (app: TrayApp) => {
    invoke("restore_tray_app", {
      pid: app.pid,
      hwnd: app.hwnd,
      exePath: app.exePath,
    }).catch(() => {});
    invoke("hide_window").catch(() => {});
  };

  return (
    <div className="glacier-dock-glass relative flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl p-3 text-[var(--glacier-text)]">
      <span className="glacier-dock-sheen" aria-hidden />

      {apps.length === 0 ? (
        <div className="grid flex-1 place-items-center px-3 text-center text-[11px] leading-relaxed opacity-55">
          No minimized or tray apps
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pt-0.5">
          <div className="grid grid-cols-5 gap-1.5">
            {apps.map((app) => {
              const key = appKey(app);
              const isSelected = menuKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={app.name}
                  aria-label={app.name}
                  onPointerEnter={() => setHoveredName(app.name)}
                  onPointerLeave={() => setHoveredName((curr) => (curr === app.name ? null : curr))}
                  onClick={() => restoreApp(app)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenuKey((curr) => (curr === key ? null : key));
                  }}
                  className={`grid size-[38px] place-items-center rounded-xl transition hover:bg-white/12 active:scale-95 ${
                    isSelected ? "bg-white/14 ring-1 ring-[var(--glacier-accent)]" : ""
                  }`}
                >
                  <TrayIcon path={app.exePath} name={app.name} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-1.5 flex min-h-[24px] items-center justify-between gap-2 border-t border-white/10 pt-1.5 text-[11px]">
        {selected ? (
          <>
            <span className="min-w-0 flex-1 truncate font-medium opacity-85">
              {selected.name}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Open"
                onClick={() => restoreApp(selected)}
                className="flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-white/20"
              >
                <ExternalLink className="size-2.5" />
                Open
              </button>
              <button
                type="button"
                title="Reveal in Explorer"
                onClick={() => invoke("reveal_process", { pid: selected.pid }).catch(() => {})}
                className="rounded-md bg-white/10 p-1 hover:bg-white/20"
              >
                <FolderOpen className="size-2.5" />
              </button>
              <button
                type="button"
                title="Close app"
                onClick={() => {
                  invoke("kill_process", { pid: selected.pid, tree: false })
                    .then(() => {
                      setMenuKey(null);
                      load();
                    })
                    .catch(() => {});
                }}
                className="rounded-md bg-rose-500/20 p-1 text-rose-200 hover:bg-rose-500/35"
              >
                <X className="size-2.5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate opacity-65">
              {hoveredName ?? "Minimized & hidden apps"}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums opacity-45">
              {apps.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
