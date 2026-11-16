import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { LiquidRefraction } from "../styles/liquid-refraction";
import {
  applyAccent,
  applyDockMetrics,
  applyPreset,
  applyTintAlpha,
  startSolarSchedule,
} from "../styles/theme";

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
  accent: string;
  solarAuto: boolean;
  solarDayPreset: string;
  solarNightPreset: string;
  chameleonTint: boolean;
  latitude?: number;
  longitude?: number;
}

interface AppConfig {
  appearance: Appearance;
  latitude: number;
  longitude: number;
}

const EDGE_ALIGN: Record<DockLayout["edge"], string> = {
  bottom: "items-end justify-center pb-[var(--glacier-edge-margin)]",
  top: "items-start justify-center pt-[var(--glacier-edge-margin)]",
  left: "items-center justify-start pl-[var(--glacier-edge-margin)]",
  right: "items-center justify-end pr-[var(--glacier-edge-margin)]",
};

function useLabel(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("dock");
  if (fromQuery) return fromQuery;
  try {
    return (
      (window as unknown as Record<string, any>).__TAURI_INTERNALS__?.metadata?.currentWindow
        ?.label ?? "dock"
    );
  } catch {
    return "dock";
  }
}

export default function DockWindow() {
  const label = useLabel();
  const pillRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glassRef = useRef<LiquidRefraction | null>(null);
  const seqRef = useRef(0);
  const [layout, setLayout] = useState<DockLayout | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Layout + appearance from Rust.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await invoke<DockLayout>("dock_layout");
        if (cancelled) return;
        setLayout(next);
        applyDockMetrics({
          iconSize: next.iconSize,
          barHeight: next.barHeight,
          radius: next.shape === "attached" ? 0 : 18,
          edgeMargin: next.shape === "attached" ? 0 : 10,
        });
        if (next.accent) applyAccent(next.accent);

        const cfg = await invoke<AppConfig>("get_config");
        if (cancelled) return;
        applyPreset(cfg.appearance.preset);
        applyTintAlpha(cfg.appearance.tintAlpha);
        if (next.highContrast) {
          applyPreset("black");
        }
      } catch {
        // Browser dev server: keep the defaults from glacier-tokens.css.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Solar auto day/night + chameleon tint.
  useEffect(() => {
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const cfg = await invoke<AppConfig>("get_config");
        stop = startSolarSchedule({
          enabled: cfg.appearance.solarAuto,
          latitude: cfg.latitude,
          longitude: cfg.longitude,
          dayPreset: cfg.appearance.solarDayPreset,
          nightPreset: cfg.appearance.solarNightPreset,
        });
        if (cfg.appearance.chameleonTint) {
          const accent = await invoke<string | null>("wallpaper_accent");
          if (accent) applyAccent(accent);
        }
      } catch {
        /* ignore outside Tauri */
      }
    })();
    return () => stop?.();
  }, []);

  // Report the pill rect to Rust: WM_NCHITTEST headroom + capture region.
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
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [layout]);

  // Liquid glass capture -> WebGL2 refraction.
  useEffect(() => {
    const canvas = canvasRef.current;
    const pill = pillRef.current;
    if (!canvas || !pill || !layout) return;

    const glass = new LiquidRefraction(canvas);
    glassRef.current = glass;
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
        /* capture unavailable (driver, secure desktop) — CSS frost remains */
      }
    }).then((unlistenFn) => {
      if (disposed) unlistenFn();
      else unlisten = unlistenFn;
    });

    return () => {
      disposed = true;
      unlisten?.();
      observer.disconnect();
      glass.dispose();
      glassRef.current = null;
    };
  }, [layout]);

  const edge = layout?.edge ?? "bottom";
  const vertical = edge === "left" || edge === "right";
  const attached = layout?.shape === "attached";
  const full = layout?.widthMode === "full";

  const time = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex h-full w-full ${EDGE_ALIGN[edge]}`}>
      <div
        ref={pillRef}
        className="relative flex items-center gap-3 overflow-hidden px-4 backdrop-blur-[28px]"
        style={{
          height: "var(--glacier-bar-height)",
          width: full ? "100%" : undefined,
          borderRadius: attached ? 0 : "var(--glacier-radius)",
          background: "var(--glacier-surface)",
          boxShadow: attached ? "none" : "var(--glacier-shadow)",
          flexDirection: vertical ? "column" : "row",
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ borderRadius: attached ? 0 : "var(--glacier-radius)" }}
        />

        <span
          className="relative inline-block size-2 shrink-0 rounded-full"
          style={{ background: "var(--glacier-accent)" }}
        />
        {!vertical && (
          <span className="relative text-xs font-medium tracking-wide opacity-90">
            Glacier Dock · {label}
          </span>
        )}
        <span className="relative ml-auto text-xs font-semibold tabular-nums opacity-90">
          {time}
        </span>
      </div>
    </div>
  );
}
