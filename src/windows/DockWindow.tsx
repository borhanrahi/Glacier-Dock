import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { AppFolderTile } from "../components/AppFolderTile";
import { DropzoneShelf, toShelfItem, type ShelfItem } from "../components/DropzoneShelf";
import { GlacierIsland, type IslandNotification } from "../components/GlacierIsland";
import { attachFisheye } from "../sdk/fisheye";
import { useAppIcon } from "../sdk/hooks";
import { LiquidRefraction } from "../styles/liquid-refraction";
import {
  applyAccent,
  applyDockMetrics,
  applyPreset,
  applyTintAlpha,
  startSolarSchedule,
} from "../styles/theme";
import { appHue, initials, type InstalledApp, type PinnedApp } from "../utils/apps";
import { CATEGORY_META, widgetMeta } from "../widgets/registry";

interface DockLayout {
  label: string;
  monitor: string;
  edge: "bottom" | "top" | "left" | "right";
  shape: "floating" | "attached";
  widthMode: "fitcontent" | "full";
  iconSize: number;
  barHeight: number;
  headroom: number;
  accent: string | null;
  highContrast: boolean;
}

interface Appearance {
  preset: string;
  tintAlpha: number;
  solarAuto: boolean;
  solarDayPreset: string;
  solarNightPreset: string;
  chameleonTint: boolean;
}

interface AppConfig {
  appearance: Appearance;
  latitude: number;
  longitude: number;
  dockWidgets?: string[];
}

interface FolderGroup {
  id: string;
  name: string;
  color: string;
  apps: InstalledApp[];
}

const EDGE_ALIGN: Record<DockLayout["edge"], string> = {
  bottom: "items-end justify-center pb-[var(--glacier-edge-margin)]",
  top: "items-start justify-center pt-[var(--glacier-edge-margin)]",
  left: "items-center justify-start pl-[var(--glacier-edge-margin)]",
  right: "items-center justify-end pr-[var(--glacier-edge-margin)]",
};

/** Real shell icon, with a deterministic initial tile as the fallback. */
function AppIcon({ app }: { app: InstalledApp }) {
  const icon = useAppIcon(app.path);

  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        draggable={false}
        className="size-full select-none object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
      />
    );
  }

  return (
    <span
      className="grid size-full place-items-center rounded-[10px]"
      style={{
        background: `hsl(${appHue(app.name)} 68% 50% / 0.9)`,
        color: "#08111d",
        fontSize: "11px",
        fontWeight: 700,
      }}
    >
      {initials(app.name)}
    </span>
  );
}

export default function DockWindow() {
  const pillRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const draggedApp = useRef<InstalledApp | null>(null);

  const [layout, setLayout] = useState<DockLayout | null>(null);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [shelf, setShelf] = useState<ShelfItem[]>([]);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [island, setIsland] = useState<IslandNotification | null>(null);
  const [running, setRunning] = useState<string[]>([]);
  const [draggingDock, setDraggingDock] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<string[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Layout + appearance from Rust.
  useEffect(() => {
    (async () => {
      try {
        const next = await invoke<DockLayout>("dock_layout");
        setLayout(next);
        applyDockMetrics({
          iconSize: next.iconSize,
          barHeight: next.barHeight,
          radius: next.shape === "attached" ? 0 : 18,
          edgeMargin: next.shape === "attached" ? 0 : 10,
        });
        if (next.accent) applyAccent(next.accent);

        const cfg = await invoke<AppConfig>("get_config");
        applyPreset(next.highContrast ? "black" : cfg.appearance.preset);
        applyTintAlpha(cfg.appearance.tintAlpha);
        setWidgets(cfg.dockWidgets ?? []);

        if (cfg.appearance.chameleonTint) {
          const accent = await invoke<string | null>("wallpaper_accent");
          if (accent) applyAccent(accent);
        }

        startSolarSchedule({
          enabled: cfg.appearance.solarAuto,
          latitude: cfg.latitude,
          longitude: cfg.longitude,
          dayPreset: cfg.appearance.solarDayPreset,
          nightPreset: cfg.appearance.solarNightPreset,
        });
      } catch {
        /* browser dev server */
      }
    })();
  }, []);

  // Pinned apps come from config, never from scanning the Start Menu. Editing
  // them in Settings (or pinning from the App Library) re-emits this event.
  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    invoke<PinnedApp[]>("pinned_apps")
      .then((list) => {
        if (alive) setApps(list);
      })
      .catch(() => setApps([]));

    listen<PinnedApp[]>("glacier://pins", (event) => setApps(event.payload))
      .then((fn) => {
        if (alive) unlisten = fn;
        else fn();
      })
      .catch(() => {});

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  // Live notifications arrive from Rust (UserNotificationListener / timers).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<IslandNotification>("glacier://island", (event) => setIsland(event.payload))
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // Context profile auto-switching (Work / Coding / Gaming).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ name: string }>("glacier://profile", (event) => setProfile(event.payload.name))
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // DWM live window preview after a short hover.
  const startPreview = (app: InstalledApp) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      invoke("show_preview_for_image", { image: `${app.name}.exe` }).catch(() => {});
    }, 450);
  };

  const endPreview = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      invoke("hide_app_preview").catch(() => {});
    }, 320);
  };

  // OS drag-and-drop -> Drop Shelf.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setShelfOpen(true);
          } else if (event.payload.type === "drop") {
            const paths = event.payload.paths ?? [];
            if (paths.length > 0) {
              setShelf((current) => {
                const next = [...current];
                for (const path of paths) {
                  if (!next.some((item) => item.path === path)) next.push(toShelfItem(path));
                }
                return next;
              });
              setShelfOpen(true);
            }
          } else if (event.payload.type === "leave") {
            setShelfOpen((open) => open || false);
          }
        });
      } catch {
        /* browser preview */
      }
    })();
    return () => unlisten?.();
  }, []);

  // Report the pill rect: WM_NCHITTEST headroom + DXGI capture region.
  useEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    const report = () => {
      const rect = pill.getBoundingClientRect();
      invoke("set_pill_rect", {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }).catch(() => {});
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(pill);
    return () => observer.disconnect();
  }, [layout]);

  // Liquid glass capture -> WebGL2 refraction.
  useEffect(() => {
    const canvas = canvasRef.current;
    const pill = pillRef.current;
    if (!canvas || !pill || !layout) return;

    const glass = new LiquidRefraction(canvas);
    if (!glass.supported) return;

    const syncSize = () => {
      const rect = pill.getBoundingClientRect();
      glass.resize(rect.width, rect.height);
      glass.render();
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(pill);

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen("glacier://glass-frame", async () => {
      if (disposed) return;
      try {
        const buffer = await invoke<ArrayBuffer>("glass_frame", { since: seqRef.current });
        if (!buffer || buffer.byteLength < 8) return;
        const view = new DataView(buffer);
        const width = view.getUint32(0, true);
        const height = view.getUint32(4, true);
        if (!width || !height) return;
        seqRef.current += 1;
        glass.uploadFrame(new Uint8Array(buffer, 8), width, height);
        glass.render();
      } catch {
        /* capture unavailable */
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
      observer.disconnect();
      glass.dispose();
    };
  }, [layout]);

  // 1.32x parabolic fisheye wave over the icon row.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !layout) return;
    const vertical = layout.edge === "left" || layout.edge === "right";
    return attachFisheye(
      row,
      () => Array.from(row.querySelectorAll<HTMLElement>("[data-icon]")),
      {
        maxScale: Math.min(1.35, Math.max(1.28, 1.32)),
        radius: 140,
        orientation: vertical ? "vertical" : "horizontal",
        displacement: 8,
      },
    );
  }, [layout, apps, folders]);

  const launch = useCallback(async (app: InstalledApp) => {
    try {
      await invoke("launch_app", { path: app.path });
      setRunning((current) => (current.includes(app.path) ? current : [...current, app.path]));
    } catch (error) {
      // Never fail silently: the tile lights up only when the shell really
      // handed off to the app, and a failure explains itself in the island.
      setIsland({
        id: `launch-${Date.now()}`,
        app: "Glacier Dock",
        title: `Could not open ${app.name}`,
        body: error instanceof Error ? error.message : String(error),
        kind: "message",
      });
    }
  }, []);

  // Drag the dock body to another screen edge.
  const onPillPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-icon]") || target.closest("[data-no-drag]")) return;
    setDraggingDock(true);
  };

  useEffect(() => {
    if (!draggingDock) return;
    const onUp = (event: PointerEvent) => {
      setDraggingDock(false);
      invoke("snap_dock_edge", { x: event.clientX, y: event.clientY }).catch(() => {});
    };
    window.addEventListener("pointerup", onUp, { once: true });
    return () => window.removeEventListener("pointerup", onUp);
  }, [draggingDock]);

  const createFolder = (target: InstalledApp) => {
    const source = draggedApp.current;
    draggedApp.current = null;
    if (!source || source.path === target.path) return;
    setFolders((current) => [
      ...current,
      {
        id: `folder-${Date.now()}`,
        name: "New Folder",
        color: "#38BDF8",
        apps: [source, target],
      },
    ]);
    setApps((current) => current.filter((app) => app.path !== source.path && app.path !== target.path));
  };

  const edge = layout?.edge ?? "bottom";
  const vertical = edge === "left" || edge === "right";
  const attached = layout?.shape === "attached";
  const full = layout?.widthMode === "full";
  const time = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const pinned = useMemo(() => apps, [apps]);

  return (
    <div className={`flex h-full w-full ${EDGE_ALIGN[edge]}`}>
      <GlacierIsland
        notification={island}
        onDismiss={() => setIsland(null)}
        onReply={() => setIsland(null)}
      />
      <DropzoneShelf
        items={shelf}
        open={shelfOpen && shelf.length > 0}
        onRemove={(path) => setShelf((items) => items.filter((item) => item.path !== path))}
        onClear={() => {
          setShelf([]);
          setShelfOpen(false);
        }}
        onReveal={() => {}}
      />

      <div
        ref={pillRef}
        onPointerDown={onPillPointerDown}
        className={`relative flex items-center gap-2 overflow-visible px-3 backdrop-blur-[28px] ${
          draggingDock ? "ring-2 ring-[var(--glacier-accent)]" : ""
        }`}
        style={{
          height: "var(--glacier-bar-height)",
          width: full ? "100%" : undefined,
          borderRadius: attached ? 0 : "var(--glacier-radius)",
          background: "var(--glacier-surface)",
          boxShadow: attached ? "none" : "var(--glacier-shadow)",
          flexDirection: vertical ? "column" : "row",
          cursor: draggingDock ? "grabbing" : "default",
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ borderRadius: attached ? 0 : "var(--glacier-radius)" }}
        />

        <div
          ref={rowRef}
          className={`relative flex items-end gap-1.5 ${vertical ? "flex-col" : "flex-row"}`}
          style={{ paddingBlock: vertical ? 6 : 0, paddingInline: vertical ? 0 : 4 }}
        >
          {pinned.map((app) => (
            <button
              key={app.path}
              data-icon
              type="button"
              draggable
              onDragStart={() => (draggedApp.current = app)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                createFolder(app);
              }}
              onClick={() => launch(app)}
              onPointerEnter={() => startPreview(app)}
              onPointerLeave={endPreview}
              title={app.name}
              className="relative grid shrink-0 place-items-center rounded-[10px] transition-transform duration-150 active:scale-90"
              style={{
                width: "var(--glacier-icon-base)",
                height: "var(--glacier-icon-base)",
                transform:
                  "translateY(calc(var(--icon-lift, 0px) * -1)) scale(var(--icon-scale, 1))",
                transformOrigin: vertical ? "center left" : "center bottom",
              }}
            >
              <AppIcon app={app} />
              {running.includes(app.path) && (
                <span
                  className="absolute -bottom-1 h-[3px] w-4 rounded-full"
                  style={{ background: "var(--glacier-accent)" }}
                />
              )}
            </button>
          ))}

          {widgets.map((id) => {
            const meta = widgetMeta(id);
            if (!meta) return null;
            return (
              <button
                key={id}
                data-icon
                data-no-drag
                type="button"
                title={`${meta.name} — ${CATEGORY_META[meta.category].label}`}
                onClick={() =>
                  invoke("open_widget", {
                    id,
                    width: meta.width,
                    height: meta.height,
                  }).catch(() => {})
                }
                className="grid shrink-0 place-items-center rounded-[9px] bg-white/10 text-[12px] transition-transform duration-150 active:scale-90"
                style={{
                  width: "calc(var(--glacier-icon-base) * 0.72)",
                  height: "calc(var(--glacier-icon-base) * 0.72)",
                }}
              >
                {CATEGORY_META[meta.category].glyph}
              </button>
            );
          })}

          {folders.map((folder) => (
            <div key={folder.id} data-icon>
              <AppFolderTile
                name={folder.name}
                color={folder.color}
                apps={folder.apps}
                vertical={vertical}
                onLaunch={launch}
                onRename={(name) =>
                  setFolders((current) =>
                    current.map((item) => (item.id === folder.id ? { ...item, name } : item)),
                  )
                }
                onColor={(color) =>
                  setFolders((current) =>
                    current.map((item) => (item.id === folder.id ? { ...item, color } : item)),
                  )
                }
                onRemoveApp={(path) =>
                  setFolders((current) =>
                    current.map((item) =>
                      item.id === folder.id
                        ? { ...item, apps: item.apps.filter((app) => app.path !== path) }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ))}

          <button
            data-icon
            data-no-drag
            type="button"
            title="App Library"
            onClick={() => invoke("open_launcher").catch(() => {})}
            className="grid shrink-0 place-items-center rounded-[10px] bg-white/10 text-sm transition-transform duration-150 active:scale-90"
            style={{
              width: "var(--glacier-icon-base)",
              height: "var(--glacier-icon-base)",
              transform:
                "translateY(calc(var(--icon-lift, 0px) * -1)) scale(var(--icon-scale, 1))",
              transformOrigin: vertical ? "center left" : "center bottom",
            }}
          >
            ▦
          </button>

          <button
            data-icon
            data-no-drag
            type="button"
            title="Glacier Activity Monitor"
            onClick={() => invoke("task_manager").catch(() => {})}
            className="grid shrink-0 place-items-center rounded-[10px] bg-white/10 text-sm transition-transform duration-150 active:scale-90"
            style={{
              width: "var(--glacier-icon-base)",
              height: "var(--glacier-icon-base)",
              transform:
                "translateY(calc(var(--icon-lift, 0px) * -1)) scale(var(--icon-scale, 1))",
              transformOrigin: vertical ? "center left" : "center bottom",
            }}
          >
            ▤
          </button>

          <button
            data-icon
            data-no-drag
            type="button"
            title="Glacier Settings"
            onClick={() => invoke("open_settings").catch(() => {})}
            className="grid shrink-0 place-items-center rounded-[10px] bg-white/10 text-sm transition-transform duration-150 active:scale-90"
            style={{
              width: "var(--glacier-icon-base)",
              height: "var(--glacier-icon-base)",
              transform:
                "translateY(calc(var(--icon-lift, 0px) * -1)) scale(var(--icon-scale, 1))",
              transformOrigin: vertical ? "center left" : "center bottom",
            }}
          >
            ⚙
          </button>

          <button
            data-icon
            data-no-drag
            type="button"
            title="Spotlight (Alt + Space)"
            onClick={() => invoke("open_spotlight").catch(() => {})}
            className="grid shrink-0 place-items-center rounded-[10px] bg-white/10 text-sm transition-transform duration-150 active:scale-90"
            style={{
              width: "var(--glacier-icon-base)",
              height: "var(--glacier-icon-base)",
              transform:
                "translateY(calc(var(--icon-lift, 0px) * -1)) scale(var(--icon-scale, 1))",
              transformOrigin: vertical ? "center left" : "center bottom",
            }}
          >
            ⌕
          </button>
        </div>

        {!vertical && (
          <div data-no-drag className="relative ml-1 flex select-none flex-col leading-tight">
            <span className="text-xs font-semibold tabular-nums opacity-90">{time}</span>
            {profile && (
              <span className="text-[8px] uppercase tracking-widest opacity-45">
                {profile}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
