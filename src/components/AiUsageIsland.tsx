import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion, type MotionValue } from "motion/react";

import { MAC_POPOVER_SPRING } from "../sdk/motion";
import { MotionDockItem } from "./MotionDockItem";

export interface AiQuotaWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
}

export interface AiProviderUsage {
  id: string;
  name: string;
  state: "ready" | "sign_in" | "unavailable";
  windows: AiQuotaWindow[];
}

const PROVIDER_COLOR: Record<string, string> = {
  claude: "#F59E0B",
  codex: "#38BDF8",
  opencode: "#A78BFA",
  gemini: "#2DD4BF",
  antigravity: "#818CF8",
};

const PROVIDER_SHORT: Record<string, string> = {
  claude: "CL",
  codex: "CX",
  opencode: "OC",
  gemini: "GM",
  antigravity: "AG",
};

/**
 * Muelle-inspired AI Usage Island pill for the dock: renders compact ring
 * gauges for active AI clients (Claude Code, Codex, Gemini CLI, Antigravity)
 * and opens a detailed quota popover on hover/click.
 */
export function AiUsageIsland({
  vertical = false,
  mouseAxis,
  baseSize,
  maxScale,
  onOpenChange,
}: {
  vertical?: boolean;
  mouseAxis: MotionValue<number>;
  baseSize: number;
  maxScale: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const [providers, setProviders] = useState<AiProviderUsage[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onOpenChange?.(open);
    return () => {
      if (open) onOpenChange?.(false);
    };
  }, [open, onOpenChange]);

  const refresh = useCallback(() => {
    invoke<AiProviderUsage[]>("ai_usage_snapshot")
      .then((list) => {
        if (Array.isArray(list)) setProviders(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const ready = providers.filter((p) => p.state === "ready" && p.windows.length > 0);
  if (ready.length === 0 || vertical) return null;

  return (
    <div data-no-drag className="relative">
      <MotionDockItem
        mouseAxis={mouseAxis}
        baseSize={baseSize}
        maxScale={maxScale}
        variant="pill"
        vertical={vertical}
        tip="AI Plan Usage"
        ariaLabel="AI Plan Usage"
        noDrag
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (window.screenX || 0) + rect.left + rect.width / 2;
          invoke("open_widget", { id: "ai-limits-dual", width: 320, height: 220, x }).catch(() =>
            setOpen((v) => !v),
          );
        }}
        className="group glacier-widget-pill glacier-icon-glow relative flex shrink-0 items-center justify-center text-[11px]"
      >
        {ready.map((provider, idx) => {
          const primary = provider.windows[0];
          const color = PROVIDER_COLOR[provider.id] ?? "#38BDF8";
          const pct = Math.min(100, Math.max(0, primary.usedPercent));
          return (
            <span key={provider.id} className="flex items-center gap-1.5">
              {idx > 0 && <span className="h-3.5 w-px bg-white/15" />}
              <span className="text-[9px] font-bold opacity-70">
                {PROVIDER_SHORT[provider.id] ?? "AI"}
              </span>
              <span className="font-semibold tabular-nums">{pct}%</span>
              <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="2.2"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke={pct >= 90 ? "#EF4444" : color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * 37.7} 37.7`}
                />
              </svg>
            </span>
          );
        })}
      </MotionDockItem>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.1 } }}
            transition={MAC_POPOVER_SPRING}
            className="glacier-dock-glass absolute bottom-[calc(100%+12px)] right-0 z-50 w-64 overflow-hidden rounded-[14px] p-3 text-[11px] will-change-transform"
          >
          <span className="glacier-dock-sheen" aria-hidden />
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">AI Plan Usage</span>
            <button
              type="button"
              onClick={refresh}
              className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] opacity-75 hover:bg-white/20 hover:opacity-100"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2.5">
            {ready.map((provider) => {
              const color = PROVIDER_COLOR[provider.id] ?? "#38BDF8";
              return (
                <div key={provider.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{provider.name}</span>
                    <span className="text-[10px] tabular-nums opacity-65">
                      {provider.windows[0].label} · {provider.windows[0].usedPercent}%
                    </span>
                  </div>
                  {provider.windows.map((win) => (
                    <div key={win.label} className="space-y-0.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${win.usedPercent}%`,
                            background: win.usedPercent >= 90 ? "#EF4444" : color,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] opacity-55">
                        <span>{win.label}</span>
                        <span className="tabular-nums">{win.usedPercent}% used</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
