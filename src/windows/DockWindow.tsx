import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, useMotionValue } from "motion/react";

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
import { MotionDockItem, type DockEdge } from "../components/MotionDockItem";
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
        className="size-full select-none object-contain"
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
  const [magnification, setMagnification] = useState(1.8);
  const [iconPlate, setIconPlate] = useState("none");
  const [showTelemetryRings, setShowTelemetryRings] = useState(true);
  const [showAiUsage, setShowAiUsage] = useState(true);
  const [showQuickFolders, setShowQuickFolders] = useState(true);
  const [clock, setClock] = useState(() => new Date());
  const [bouncingApp, setBouncingApp] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ app: InstalledApp; x: number } | null>(null);
  const [surfaceMenuX, setSurfaceMenuX] = useState<number | null>(null);
  const [dockHovered, setDockHovered] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const telemetry = useTelemetry();
  const hoverTimer = useRef<number | undefined>(undefined);
  const bounceTimer = useRef<number | undefined>(undefined);
  const pointerRafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<number | null>(null);
  const restRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const lastReportedPillRef = useRef({ x: -1, y: -1, w: -1, h: -1 });
  const wasHoveredRef = useRef(false);
  const wasHitHoveredRef = useRef(false);
  const overlayOpenRef = useRef(false);
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
        setMagnification(cfg.appearance.magnification ?? 1.8);
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
      setMagnification(cfg.appearance.magnification ?? 1.8);
      setIconPlate(cfg.appearance.iconPlate ?? "none");
      setShowTelemetryRings(cfg.showTelemetryRings ?? true);
      setShowAiUsage(cfg.showAiUsage ?? true);
      setShowQuickFolders(cfg.showQuickFolders ?? true);
      invoke<DockLayout>("dock_layout")
        .then((next) => {
          setLayout(next);
          applyDockMetrics({
            iconSize: next.iconSize,
            barHeight: next.barHeight,
            radius: next.shape === "attached" ? 0 : 18,
            edgeMargin: next.shape === "attached" ? 0 : 10,
          });
        })
        .catch(() => {});
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, [layout]);

  const edge: DockEdge = layout?.edge ?? "bottom";
  const vertical = edge === "left" || edge === "right";
  const attached = layout?.shape === "attached";
  const full = layout?.widthMode === "full";
  const barHeight = layout?.barHeight ?? 52;
  const baseIconSize = layout?.iconSize ?? 42;
  const crossPad = Math.max(4, Math.round((barHeight - baseIconSize) / 2));
  const maxMag = magnification;
  const maxGrowPx =
    maxMag > 1.01 ? Math.ceil(baseIconSize * (Math.min(2.05, maxMag) - 1)) + 16 : 8;

  const pinned = useMemo(() => {
    const pinnedLower = new Set(apps.map((a) => a.path.toLowerCase()));
    const extra = transientApps.filter((a) => !pinnedLower.has(a.path.toLowerCase()));
    return [...apps, ...extra];
  }, [apps, transientApps]);

  const overlayOpen =
    contextMenu !== null ||
    surfaceMenuX !== null ||
    (shelfOpen && shelf.length > 0) ||
    island !== null ||
    folderOpen ||
    aiOpen;
  overlayOpenRef.current = overlayOpen;

  const clearDockHover = useCallback(() => {
    if (pointerRafRef.current !== null) {
      cancelAnimationFrame(pointerRafRef.current);
      pointerRafRef.current = null;
    }
    pendingPointerRef.current = null;
    mouseAxis.set(Number.POSITIVE_INFINITY);
    setDockHovered(false);
  }, [mouseAxis]);

  const onPillPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dockHovered) setDockHovered(true);
      pendingPointerRef.current = vertical ? event.clientY : event.clientX;
      if (pointerRafRef.current !== null) return;
      pointerRafRef.current = requestAnimationFrame(() => {
        pointerRafRef.current = null;
        if (pendingPointerRef.current !== null) {
          mouseAxis.set(pendingPointerRef.current);
        }
      });
    },
    [dockHovered, vertical, mouseAxis],
  );

  useEffect(() => {
    window.addEventListener("blur", clearDockHover);
    return () => {
      window.removeEventListener("blur", clearDockHover);
      if (pointerRafRef.current !== null) cancelAnimationFrame(pointerRafRef.current);
    };
  }, [clearDockHover]);

  // Report resting pill rect only when settled (never during hover magnification).
  useEffect(() => {
    if (dockHovered) {
      wasHoveredRef.current = true;
      return;
    }
    const pill = pillRef.current;
    if (!pill) return;
    let rafId: number | undefined;
    let settleTimer: number | undefined;

    const measureAndReport = () => {
      const rect = pill.getBoundingClientRect();
      restRectRef.current = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      const prev = lastReportedPillRef.current;
      if (
        Math.abs(rect.x - prev.x) < 2 &&
        Math.abs(rect.y - prev.y) < 2 &&
        Math.abs(rect.width - prev.w) < 2 &&
        Math.abs(rect.height - prev.h) < 2
      ) {
        return;
      }
      lastReportedPillRef.current = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      invoke("set_pill_rect", {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }).catch(() => {});
      if (overlayOpenRef.current) {
        invoke("set_hit_rect", {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        }).catch(() => {});
      }
    };

    const scheduleMeasure = () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = undefined;
        measureAndReport();
      });
    };

    if (wasHoveredRef.current) {
      wasHoveredRef.current = false;
      settleTimer = window.setTimeout(scheduleMeasure, 220);
    } else {
      scheduleMeasure();
    }

    window.addEventListener("resize", scheduleMeasure);
    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [
    dockHovered,
    layout,
    pinned.length,
    folders.length,
    widgets.length,
    showTelemetryRings,
    showAiUsage,
    showQuickFolders,
  ]);

  // Decoupled interactive hit-rect for hover magnification, tooltips, and popovers.
  useEffect(() => {
    let timer: number | undefined;
    const clampHit = (x1: number, y1: number, x2: number, y2: number) => {
      const cx1 = Math.max(0, Math.floor(x1));
      const cy1 = Math.max(0, Math.floor(y1));
      const cx2 = Math.min(window.innerWidth, Math.ceil(x2));
      const cy2 = Math.min(window.innerHeight, Math.ceil(y2));
      invoke("set_hit_rect", {
        x: cx1,
        y: cy1,
        width: Math.max(1, cx2 - cx1),
        height: Math.max(1, cy2 - cy1),
      }).catch(() => {});
    };

    if (overlayOpen) {
      wasHitHoveredRef.current = false;
      clampHit(0, 0, window.innerWidth, window.innerHeight);
      return;
    }

    const applyHoverOrRestHit = () => {
      const rect =
        restRectRef.current.width > 0
          ? restRectRef.current
          : pillRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      if (dockHovered) {
        const headPad = maxGrowPx + 36;
        const mainPad = Math.ceil(baseIconSize * 2.2);
        if (edge === "bottom") {
          clampHit(rect.x - mainPad, rect.y - headPad, rect.x + rect.width + mainPad, rect.y + rect.height + 6);
        } else if (edge === "top") {
          clampHit(rect.x - mainPad, rect.y - 6, rect.x + rect.width + mainPad, rect.y + rect.height + headPad);
        } else if (edge === "left") {
          clampHit(rect.x - 6, rect.y - mainPad, rect.x + rect.width + headPad, rect.y + rect.height + mainPad);
        } else {
          clampHit(rect.x - headPad, rect.y - mainPad, rect.x + rect.width + 6, rect.y + rect.height + mainPad);
        }
      } else {
        clampHit(rect.x - 4, rect.y - 4, rect.x + rect.width + 4, rect.y + rect.height + 4);
      }
    };

    if (dockHovered) {
      wasHitHoveredRef.current = true;
      applyHoverOrRestHit();
    } else if (wasHitHoveredRef.current) {
      wasHitHoveredRef.current = false;
      timer = window.setTimeout(applyHoverOrRestHit, 200);
    } else {
      timer = window.setTimeout(applyHoverOrRestHit, 32);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [dockHovered, overlayOpen, edge, maxGrowPx, baseIconSize, layout]);

  const openCommand = useCallback(
    (cmd: string, args?: Record<string, unknown>, el?: HTMLElement | null) => {
      clearDockHover();
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
    [clearDockHover],
  );

  const launch = useCallback(
    async (app: InstalledApp) => {
      clearDockHover();
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
    },
    [clearDockHover],
  );

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

  const time = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const weekday = clock.toLocaleDateString([], { weekday: "short" }).toUpperCase();
  const dateLabel = clock.toLocaleDateString([], { day: "numeric", month: "short" });
  const dockCrossAlign = edge === "top" || edge === "left" ? "items-start" : "items-end";
  const pillStyle: CSSProperties = {
    borderRadius: attached ? 0 : "var(--glacier-radius)",
    boxShadow: attached ? "none" : undefined,
    flexDirection: vertical ? "column" : "row",
    cursor: draggingDock ? "grabbing" : "default",
    ...(vertical
      ? {
          width: barHeight,
          height: full ? "100%" : undefined,
          paddingLeft: edge === "left" ? crossPad : 0,
          paddingRight: edge === "right" ? crossPad : 0,
          paddingBlock: 10,
        }
      : {
          height: barHeight,
          width: full ? "100%" : undefined,
          paddingBottom: edge === "bottom" ? crossPad : 0,
          paddingTop: edge === "top" ? crossPad : 0,
          paddingInline: 10,
        }),
  };
  const dividerClass = vertical
    ? "relative z-10 my-1 h-px w-6 shrink-0 self-center bg-white/[0.12]"
    : "relative z-10 mx-1 h-6 w-px shrink-0 self-center bg-white/[0.12]";

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
        onPointerMove={onPillPointerMove}
        onPointerLeave={clearDockHover}
        onPointerDown={onPillPointerDown}
        onContextMenu={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-app-icon]")) return;
          event.preventDefault();
          invoke("show_dock_menu").catch(() => setSurfaceMenuX(event.clientX));
        }}
        className={`glacier-dock-glass relative flex ${dockCrossAlign} gap-2 overflow-visible ${
          draggingDock ? "ring-2 ring-[var(--glacier-accent)]" : ""
        }`}
        style={pillStyle}
      >
        {dockHovered && (
          <span
            aria-hidden
            data-no-drag
            className="pointer-events-auto absolute z-0"
            style={
              edge === "bottom"
                ? { top: -maxGrowPx, left: -16, right: -16, height: maxGrowPx + barHeight }
                : edge === "top"
                  ? { bottom: -maxGrowPx, left: -16, right: -16, height: maxGrowPx + barHeight }
                  : edge === "left"
                    ? { right: -maxGrowPx, top: -16, bottom: -16, width: maxGrowPx + barHeight }
                    : { left: -maxGrowPx, top: -16, bottom: -16, width: maxGrowPx + barHeight }
            }
          />
        )}
        {!attached && edge === "bottom" && <span className="glacier-dock-sheen" aria-hidden />}

        <div
          ref={rowRef}
          className={`relative z-10 flex ${dockCrossAlign} gap-2 overflow-visible ${
            vertical ? "flex-col" : "flex-row"
          }`}
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
                edge={edge}
                vertical={vertical}
                iconRatio={iconPlate && iconPlate !== "none" ? 0.96 : 0.84}
                running={isRunning}
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
                className="group glacier-icon-glow relative grid shrink-0 place-items-center rounded-[11px]"
              >
                <span className={`grid size-full place-items-center ${plateClass}`}>
                  <AppIcon app={app} />
                </span>
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
              edge={edge}
              vertical={vertical}
              onOpenChange={setFolderOpen}
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
                baseSize={baseIconSize}
                maxScale={maxMag}
                variant={vertical ? "square" : "pill"}
                edge={edge}
                vertical={vertical}
                iconRatio={0.56}
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
                className="group glacier-widget-pill glacier-icon-glow relative flex shrink-0 items-center justify-center rounded-2xl"
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
                baseSize={baseIconSize}
                maxScale={maxMag}
                edge={edge}
                vertical={vertical}
                iconRatio={0.54}
                tip="Downloads"
                ariaLabel="Downloads"
                noDrag
                onClick={() => invoke("open_path", { path: "shell:Downloads" }).catch(() => {})}
                className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center rounded-2xl"
              >
                <DownloadsIcon />
              </MotionDockItem>

              <MotionDockItem
                mouseAxis={mouseAxis}
                baseSize={baseIconSize}
                maxScale={maxMag}
                edge={edge}
                vertical={vertical}
                iconRatio={0.54}
                tip="Recycle Bin"
                ariaLabel="Recycle Bin"
                noDrag
                onClick={() =>
                  invoke("open_path", { path: "shell:RecycleBinFolder" }).catch(() => {})
                }
                className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center rounded-2xl"
              >
                <TrashBinIcon />
              </MotionDockItem>
            </>
          )}

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={baseIconSize}
            maxScale={maxMag}
            edge={edge}
            vertical={vertical}
            iconRatio={0.54}
            tip="App Library"
            ariaLabel="App Library"
            noDrag
            onClick={() => openCommand("open_launcher")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center rounded-2xl"
          >
            <StartGridIcon />
          </MotionDockItem>

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={baseIconSize}
            maxScale={maxMag}
            edge={edge}
            vertical={vertical}
            iconRatio={0.54}
            tip="Activity Monitor"
            ariaLabel="Glacier Activity Monitor"
            noDrag
            onClick={() => openCommand("task_manager")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center rounded-2xl"
          >
            <ActivityMonitorIcon />
          </MotionDockItem>

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={baseIconSize}
            maxScale={maxMag}
            edge={edge}
            vertical={vertical}
            iconRatio={0.54}
            tip="Settings"
            ariaLabel="Glacier Settings"
            noDrag
            onClick={() => openCommand("open_settings")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center rounded-2xl"
          >
            <SettingsGearIcon />
          </MotionDockItem>

          <MotionDockItem
            mouseAxis={mouseAxis}
            baseSize={baseIconSize}
            maxScale={maxMag}
            edge={edge}
            vertical={vertical}
            iconRatio={0.54}
            tip="Spotlight (Alt + Space)"
            ariaLabel="Spotlight (Alt + Space)"
            noDrag
            onClick={() => openCommand("open_spotlight")}
            className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center rounded-2xl"
          >
            <SpotlightSearchIcon />
          </MotionDockItem>
        </div>

        {!vertical && (
          <>
            <span className={dividerClass} aria-hidden />
            <div data-no-drag className={`relative z-10 flex ${dockCrossAlign} gap-2`}>
              {showTelemetryRings && (
                <>
                  <DockRingMeter
                    label="CPU"
                    value={telemetry.cpuPercent}
                    tooltip={`CPU ${telemetry.cpuPercent.toFixed(0)}%`}
                    edge={edge}
                    mouseAxis={mouseAxis}
                    baseSize={baseIconSize}
                    maxScale={maxMag}
                    onClick={() => openCommand("task_manager")}
                  />
                  <DockRingMeter
                    label="RAM"
                    value={telemetry.ramPercent}
                    tooltip={`RAM ${telemetry.ramPercent.toFixed(0)}% (${Math.round(telemetry.ramUsedMb / 1024)}/${Math.round(telemetry.ramTotalMb / 1024)} GB)`}
                    edge={edge}
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
                      edge={edge}
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
                      edge={edge}
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
                  onOpenChange={setAiOpen}
                />
              )}
              <MotionDockItem
                mouseAxis={mouseAxis}
                baseSize={baseIconSize}
                maxScale={maxMag}
                edge={edge}
                vertical={vertical}
                iconRatio={0.46}
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
                className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center rounded-2xl"
              >
                <ChevronTrayIcon />
              </MotionDockItem>
              <div
                className="glacier-widget-pill relative flex shrink-0 select-none items-center gap-2.5 px-3"
                style={{ height: baseIconSize }}
              >
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

      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
        {surfaceMenuX !== null && (
          <DockSurfaceMenu
            anchorX={surfaceMenuX}
            hasShelf={shelf.length > 0}
            onToggleShelf={() => setShelfOpen((v) => !v)}
            onClose={() => setSurfaceMenuX(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
