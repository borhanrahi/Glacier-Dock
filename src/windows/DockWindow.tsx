import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMotionValue } from "motion/react";

import { AiUsageIsland } from "../components/AiUsageIsland";
import { AppFolderTile } from "../components/AppFolderTile";
import { DockContextMenu, DockSurfaceMenu } from "../components/DockContextMenu";
import {
  ActivityMonitorIcon,
  ChevronTrayIcon,
  DownloadsIcon,
  SettingsGearIcon,
  SpotlightSearchIcon,
  StartGridIcon,
  TrashBinIcon,
} from "../components/DockIcons";
import { DockRingMeter } from "../components/DockRingMeter";
import { DropzoneShelf, toShelfItem, type ShelfItem } from "../components/DropzoneShelf";
import { GlacierIsland, type IslandNotification } from "../components/GlacierIsland";
import { MotionDockItem } from "../components/MotionDockItem";
import { useAppIcon, useTelemetry } from "../sdk/hooks";
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
  iconPlate?: string;
  tintAlpha: number;
  solarAuto: boolean;
  solarDayPreset: string;
  solarNightPreset: string;
  chameleonTint: boolean;
  magnification?: number;
}

interface AppConfig {
  appearance: Appearance;
  latitude: number;
  longitude: number;
  dockWidgets?: string[];
  showTelemetryRings?: boolean;
  showAiUsage?: boolean;
  showQuickFolders?: boolean;
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

  if (app.path.toLowerCase().startsWith("ms-settings:")) {
    return (
      <span className="grid size-full place-items-center rounded-[10px] border border-white/20 bg-white/10">
        <SettingsGearIcon />
      </span>
    );
  }

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
  const rowRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState<DockLayout | null>(null);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [transientApps, setTransientApps] = useState<InstalledApp[]>([]);
  const [folders, setFolders] = useState<FolderGroup[]>([]);
  const [shelf, setShelf] = useState<ShelfItem[]>([]);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [island, setIsland] = useState<IslandNotification | null>(null);
  const [running, setRunning] = useState<string[]>([]);
  const [draggingDock, setDraggingDock] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<string[]>([]);
  const [magnification, setMagnification] = useState(1.36);
  const [iconPlate, setIconPlate] = useState("none");
  const [showTelemetryRings, setShowTelemetryRings] = useState(true);
  const [showAiUsage, setShowAiUsage] = useState(true);
  const [showQuickFolders, setShowQuickFolders] = useState(true);
  const [clock, setClock] = useState(() => new Date());
  const [bouncingApp, setBouncingApp] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ app: InstalledApp; x: number } | null>(null);
  const [surfaceMenuX, setSurfaceMenuX] = useState<number | null>(null);
  const telemetry = useTelemetry();
  const hoverTimer = useRef<number | undefined>(undefined);
  const bounceTimer = useRef<number | undefined>(undefined);
  const mouseAxis = useMotionValue(Number.POSITIVE_INFINITY);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Poll live running Windows apps so newly opened apps appear on the dock.
  useEffect(() => {
    let disposed = false;
    const poll = () => {
      invoke<InstalledApp[]>("running_apps")
        .then((list) => {
          if (disposed || !Array.isArray(list)) return;
          const lowerPaths = list.map((a) => a.path.toLowerCase());
          setRunning(lowerPaths);
          setTransientApps(list);
        })
        .catch(() => {});
    };
    poll();
    const id = window.setInterval(poll, 2500);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
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
        setMagnification(cfg.appearance.magnification ?? 1.36);
        setIconPlate(cfg.appearance.iconPlate ?? "none");
        setShowTelemetryRings(cfg.showTelemetryRings ?? true);
        setShowAiUsage(cfg.showAiUsage ?? true);
        setShowQuickFolders(cfg.showQuickFolders ?? true);

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

  const anchorX = (el: HTMLElement | null) => {
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    return (window.screenX || 0) + rect.left + rect.width / 2;
  };

  // DWM live window preview after a short hover, anchored above the icon.
  const startPreview = (app: InstalledApp, el: HTMLElement) => {
    const x = anchorX(el);
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      invoke("show_preview_for_image", { image: `${app.name}.exe`, x }).catch(() => {});
    }, 380);
  };

  const endPreview = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      invoke("hide_app_preview").catch(() => {});
    }, 240);
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

  // Live config updates from Settings / Reset.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<AppConfig>("glacier://config", (event) => {
      const cfg = event.payload;
      if (!cfg) return;
      applyPreset(layout?.highContrast ? "black" : cfg.appearance.preset);
      applyTintAlpha(cfg.appearance.tintAlpha);
      setWidgets(cfg.dockWidgets ?? []);
      setMagnification(cfg.appearance.magnification ?? 1.36);
      setIconPlate(cfg.appearance.iconPlate ?? "none");
      setShowTelemetryRings(cfg.showTelemetryRings ?? true);
      setShowAiUsage(cfg.showAiUsage ?? true);
      setShowQuickFolders(cfg.showQuickFolders ?? true);
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, [layout]);

  // Report the pill rect (throttled): WM_NCHITTEST headroom + DXGI capture region.
  useEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    let pending: number | undefined;
    let last = { x: -1, y: -1, w: -1, h: -1 };
    const reportNow = () => {
      pending = undefined;
      const rect = pill.getBoundingClientRect();
      if (
        Math.abs(rect.x - last.x) < 2 &&
        Math.abs(rect.y - last.y) < 2 &&
        Math.abs(rect.width - last.w) < 2 &&
        Math.abs(rect.height - last.h) < 2
      ) {
        return;
      }
      last = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      invoke("set_pill_rect", {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }).catch(() => {});
    };
    const schedule = () => {
      if (pending !== undefined) return;
      pending = window.setTimeout(reportNow, 64);
    };
    reportNow();
    const observer = new ResizeObserver(schedule);
    observer.observe(pill);
    window.addEventListener("resize", schedule);
    return () => {
      if (pending !== undefined) window.clearTimeout(pending);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [layout, apps, folders, widgets, showTelemetryRings, showAiUsage, showQuickFolders]);

  const openCommand = useCallback(
    (cmd: string, args?: Record<string, unknown>, el?: HTMLElement | null) => {
      window.clearTimeout(hoverTimer.current);
      invoke("hide_app_preview").catch(() => {});
      const payload = el ? { ...args, x: anchorX(el) } : args;
      invoke(cmd, payload).catch((error) => {
        setIsland({
          id: `cmd-${Date.now()}`,
          app: "Glacier Dock",
          title: `Action failed (${cmd})`,
          body: error instanceof Error ? error.message : String(error),
          kind: "message",
        });
      });
    },
    [],
  );

  const launch = useCallback(async (app: InstalledApp) => {
    window.clearTimeout(hoverTimer.current);
    invoke("hide_app_preview").catch(() => {});
    setBouncingApp(app.path);
    window.clearTimeout(bounceTimer.current);
    bounceTimer.current = window.setTimeout(() => setBouncingApp(null), 440);
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

  const togglePinApp = useCallback(async (target: InstalledApp) => {
    setApps((current) => {
      const exists = current.some((item) => item.path === target.path);
      const next = exists
        ? current.filter((item) => item.path !== target.path)
        : [...current, target];
      invoke("set_pinned_apps", {
        apps: next.map((item) => ({ name: item.name, path: item.path })),
      }).catch(() => {});
      return next;
    });
  }, []);

  const edge = layout?.edge ?? "bottom";
  const vertical = edge === "left" || edge === "right";
  const attached = layout?.shape === "attached";
  const full = layout?.widthMode === "full";
  const time = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const weekday = clock.toLocaleDateString([], { weekday: "short" }).toUpperCase();
  const dateLabel = clock.toLocaleDateString([], { day: "numeric", month: "short" });
  const pinned = useMemo(() => {
    const pinnedLower = new Set(apps.map((a) => a.path.toLowerCase()));
    const extra = transientApps.filter((a) => !pinnedLower.has(a.path.toLowerCase()));
    return [...apps, ...extra];
  }, [apps, transientApps]);
  const baseIconSize = layout?.iconSize ?? 42;
  const utilSize = Math.round(baseIconSize * 0.9);
  const maxMag = magnification;
  const dividerClass = vertical
    ? "my-1 h-px w-6 shrink-0 bg-white/[0.12]"
    : "mx-1 h-6 w-px shrink-0 self-center bg-white/[0.12]";

  const inlineWidgetLabel = (id: string, fallback: string): string => {
    switch (id) {
      case "cpu-monitor":
        return `${telemetry.cpuPercent.toFixed(0)}%`;
      case "memory-gauge":
        return `${telemetry.ramPercent.toFixed(0)}%`;
      case "disk-space":
        return `${Math.round(telemetry.diskFreeGb)} GB`;
      case "network-throughput":
        return `↓${Math.round(telemetry.netDownBps / 1024)}K`;
      case "top-process":
        return telemetry.topProcess ? telemetry.topProcess.name : fallback;
      case "battery-status":
        return telemetry.batteryPercent !== null ? `${Math.round(telemetry.batteryPercent)}%` : fallback;
      default:
        return fallback;
    }
  };

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
        onPointerMove={(event) => mouseAxis.set(vertical ? event.pageY : event.pageX)}
        onPointerLeave={() => mouseAxis.set(Number.POSITIVE_INFINITY)}
        onPointerDown={onPillPointerDown}
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-app-icon]")) return;
          event.preventDefault();
          invoke("show_dock_menu").catch(() => setSurfaceMenuX(event.clientX));
        }}
        className={`glacier-dock-glass relative flex items-center gap-1.5 overflow-visible px-2.5 ${
          draggingDock ? "ring-2 ring-[var(--glacier-accent)]" : ""
        }`}
        style={{
          height: "var(--glacier-bar-height)",
          width: full ? "100%" : undefined,
          borderRadius: attached ? 0 : "var(--glacier-radius)",
          boxShadow: attached ? "none" : undefined,
          flexDirection: vertical ? "column" : "row",
          cursor: draggingDock ? "grabbing" : "default",
        }}
      >
        {!attached && edge === "bottom" && <span className="glacier-dock-sheen" aria-hidden />}

        <div
          ref={rowRef}
          className={`relative flex items-end gap-1.5 overflow-visible ${
            vertical ? "flex-col" : "flex-row"
          }`}
          style={{ paddingBlock: vertical ? 6 : 0, paddingInline: vertical ? 0 : 2 }}
        >
          {pinned.map((app) => {
            const isRunning = running.includes(app.path.toLowerCase());
            const isBouncing = bouncingApp === app.path;
            const plateClass =
              iconPlate && iconPlate !== "none" ? `glacier-plate-${iconPlate}` : "";
            return (
              <MotionDockItem
                key={app.path}
                mouseAxis={mouseAxis}
                baseSize={baseIconSize}
                maxScale={maxMag}
                vertical={vertical}
                lift={9}
                tip={app.name}
                ariaLabel={app.name}
                bouncing={isBouncing}
                appIcon
                onClick={() => launch(app)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  endPreview();
                  invoke("show_app_menu", {
                    path: app.path,
                    pinned: true,
                  }).catch(() => setContextMenu({ app, x: event.clientX }));
                }}
                onPointerEnter={(event) => startPreview(app, event.currentTarget)}
                onPointerLeave={endPreview}
                className="group glacier-icon-glow relative grid shrink-0 place-items-center rounded-[11px] will-change-transform"
              >
                <span className={`grid size-full place-items-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${plateClass}`}>
                  <AppIcon app={app} />
                </span>
                {isRunning && (
                  <span
                    className="absolute -bottom-1.5 h-[3px] w-3.5 rounded-full"
                    style={{
                      background: "var(--glacier-aurora-line)",
                      boxShadow: "0 0 8px rgba(56, 189, 248, 0.65)",
                    }}
                  />
                )}
              </MotionDockItem>
            );
          })}

          {folders.map((folder) => (
            <AppFolderTile
              key={folder.id}
              name={folder.name}
              color={folder.color}
              apps={folder.apps}
              mouseAxis={mouseAxis}
              baseSize={baseIconSize}
              maxScale={maxMag}
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
          ))}

          {(pinned.length > 0 || folders.length > 0) && <span className={dividerClass} aria-hidden />}

          {widgets.map((id) => {
            const meta = widgetMeta(id);
            if (!meta) return null;
            return (
              <MotionDockItem
                key={id}
                mouseAxis={mouseAxis}
                baseSize={utilSize}
                maxScale={maxMag}
                variant={vertical ? "square" : "pill"}
                vertical={vertical}
                lift={7}
                tip={meta.name}
                ariaLabel={`${meta.name} — ${CATEGORY_META[meta.category].label}`}
                noDrag
                onClick={(event) =>
                  openCommand(
                    "open_widget",
                    {
                      id,
                      width: meta.width,
                      height: meta.height,
                    },
                    event.currentTarget,
                  )
                }
                className={`group glacier-widget-pill glacier-icon-glow relative flex shrink-0 items-center justify-center gap-1.5 will-change-transform ${
                  vertical ? "" : "px-2.5"
                }`}
              >
                <span className="text-[13px] leading-none">
                  {CATEGORY_META[meta.category].glyph}
                </span>
                {!vertical && (
                  <span className="max-w-[74px] truncate text-[11px] font-medium tabular-nums opacity-85">
                    {inlineWidgetLabel(id, meta.name)}
                  </span>
                )}
              </MotionDockItem>
            );
          })}

          {showQuickFolders && (
            <>
              <MotionDockItem
                mouseAxis={mouseAxis}
                baseSize={utilSize}
                maxScale={maxMag}
                vertical={vertical}
                lift={8}
                tip="Downloads"
                ariaLabel="Downloads"
                noDrag
                onClick={() => invoke("open_path", { path: "shell:Downloads" }).catch(() => {})}
                className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center will-change-transform"
              >
                <DownloadsIcon />
              </MotionDockItem>

              <MotionDockItem
                mouseAxis={mouseAxis}
                baseSize={utilSize}
                maxScale={maxMag}
                vertical={vertical}
                lift={8}
                tip="Recycle Bin"
                ariaLabel="Recycle Bin"
                noDrag
                onClick={() =>
                  invoke("open_path", { path: "shell:RecycleBinFolder" }).catch(() => {})
                }
                className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center will-change-transform"
              >
                <TrashBinIcon />
              </MotionDockItem>
            </>
          )}

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={utilSize}
            maxScale={maxMag}
            vertical={vertical}
            lift={8}
            tip="App Library"
            ariaLabel="App Library"
            noDrag
            onClick={() => openCommand("open_launcher")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center will-change-transform"
          >
            <StartGridIcon />
          </MotionDockItem>

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={utilSize}
            maxScale={maxMag}
            vertical={vertical}
            lift={8}
            tip="Activity Monitor"
            ariaLabel="Glacier Activity Monitor"
            noDrag
            onClick={() => openCommand("task_manager")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center will-change-transform"
          >
            <ActivityMonitorIcon />
          </MotionDockItem>

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={utilSize}
            maxScale={maxMag}
            vertical={vertical}
            lift={8}
            tip="Settings"
            ariaLabel="Glacier Settings"
            noDrag
            onClick={() => openCommand("open_settings")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center will-change-transform"
          >
            <SettingsGearIcon />
          </MotionDockItem>

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={utilSize}
            maxScale={maxMag}
            vertical={vertical}
            lift={8}
            tip="Spotlight (Alt + Space)"
            ariaLabel="Spotlight (Alt + Space)"
            noDrag
            onClick={() => openCommand("open_spotlight")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center will-change-transform"
          >
            <SpotlightSearchIcon />
          </MotionDockItem>
        </div>

        {!vertical && (
          <>
            <span className={dividerClass} aria-hidden />
            <div data-no-drag className="relative flex items-end gap-1.5">
              {showTelemetryRings && (
                <>
                  <DockRingMeter
                    label="CPU"
                    value={telemetry.cpuPercent}
                    tooltip={`CPU ${telemetry.cpuPercent.toFixed(0)}%`}
                    mouseAxis={mouseAxis}
                    baseSize={baseIconSize}
                    maxScale={maxMag}
                    onClick={() => openCommand("task_manager")}
                  />
                  <DockRingMeter
                    label="RAM"
                    value={telemetry.ramPercent}
                    tooltip={`RAM ${telemetry.ramPercent.toFixed(0)}% (${Math.round(telemetry.ramUsedMb / 1024)}/${Math.round(telemetry.ramTotalMb / 1024)} GB)`}
                    mouseAxis={mouseAxis}
                    baseSize={baseIconSize}
                    maxScale={maxMag}
                    onClick={() => openCommand("task_manager")}
                  />
                  {telemetry.gpuPercent !== null && (
                    <DockRingMeter
                      label="GPU"
                      value={telemetry.gpuPercent}
                      tooltip={`GPU ${telemetry.gpuPercent.toFixed(0)}%`}
                      mouseAxis={mouseAxis}
                      baseSize={baseIconSize}
                      maxScale={maxMag}
                      onClick={() => openCommand("task_manager")}
                    />
                  )}
                  {telemetry.batteryPercent !== null && (
                    <DockRingMeter
                      label="BAT"
                      value={telemetry.batteryPercent}
                      charging={telemetry.batteryCharging}
                      tooltip={`Battery ${Math.round(telemetry.batteryPercent)}%${telemetry.batteryCharging ? " (Charging)" : ""}`}
                      mouseAxis={mouseAxis}
                      baseSize={baseIconSize}
                      maxScale={maxMag}
                    />
                  )}
                </>
              )}
              {showAiUsage && (
                <AiUsageIsland
                  vertical={vertical}
                  mouseAxis={mouseAxis}
                  baseSize={baseIconSize}
                  maxScale={maxMag}
                />
              )}
              <MotionDockItem
                mouseAxis={mouseAxis}
                baseSize={Math.round(baseIconSize * 0.82)}
                maxScale={maxMag}
                vertical={vertical}
                lift={6}
                tip="Hidden Apps"
                ariaLabel="Hidden & Background Apps"
                noDrag
                onClick={(event) =>
                  openCommand(
                    "open_widget",
                    {
                      id: "background-apps",
                      width: 340,
                      height: 380,
                    },
                    event.currentTarget,
                  )
                }
                className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center will-change-transform"
              >
                <ChevronTrayIcon />
              </MotionDockItem>
              <div className="glacier-widget-pill relative flex select-none items-center gap-2.5 px-3 py-1.5">
                <div className="flex flex-col leading-none">
                  <span className="text-[9px] font-semibold tracking-wider opacity-55">
                    {weekday}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium opacity-85">{dateLabel}</span>
                </div>
                <span className="text-[15px] font-semibold tabular-nums tracking-tight">
                  {time}
                </span>
                {profile && (
                  <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-widest opacity-70">
                    {profile}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {contextMenu && (
        <DockContextMenu
          app={contextMenu.app}
          pinned={pinned.some((item) => item.path === contextMenu.app.path)}
          anchorX={contextMenu.x}
          onClose={() => setContextMenu(null)}
          onLaunch={launch}
          onTogglePin={togglePinApp}
        />
      )}

      {surfaceMenuX !== null && (
        <DockSurfaceMenu
          anchorX={surfaceMenuX}
          hasShelf={shelf.length > 0}
          onToggleShelf={() => setShelfOpen((v) => !v)}
          onClose={() => setSurfaceMenuX(null)}
        />
      )}
    </div>
  );
}
