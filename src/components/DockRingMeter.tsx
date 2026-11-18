/**
 * Compact OpenTaskbar-style circular RingMeter pill for live dock telemetry
 * (CPU, RAM, GPU, Battery) using Glacier's Aurora & threshold palette.
 */

import type { MotionValue } from "motion/react";

import { MotionDockItem, type DockEdge } from "./MotionDockItem";

export interface DockRingMeterProps {
  label: string;
  value: number;
  tooltip: string;
  edge?: DockEdge;
  vertical?: boolean;
  charging?: boolean;
  mouseAxis: MotionValue<number>;
  baseSize: number;
  maxScale: number;
  onClick?: () => void;
}

function ringStrokeColor(label: string, value: number, charging?: boolean): string {
  if (label === "BAT") {
    if (charging) return "#2DD4BF";
    if (value <= 20) return "#EF4444";
    return "#38BDF8";
  }
  if (value >= 90) return "#EF4444";
  if (value >= 75) return "#FBBF24";
  return "#2DD4BF";
}

export function DockRingMeter({
  label,
  value,
  tooltip,
  edge,
  vertical = false,
  charging = false,
  mouseAxis,
  baseSize,
  maxScale,
  onClick,
}: DockRingMeterProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const stroke = ringStrokeColor(label, clamped, charging);

  return (
    <MotionDockItem
      mouseAxis={mouseAxis}
      baseSize={baseSize}
      maxScale={maxScale}
      edge={edge}
      vertical={vertical}
      iconRatio={0.84}
      tip={tooltip}
      ariaLabel={tooltip}
      noDrag
      onClick={onClick}
      className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center"
    >
      <span className="relative grid size-full place-items-center">
        <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth="2.8"
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 320ms ease, stroke 240ms ease" }}
          />
        </svg>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-[7px] font-semibold tracking-wider opacity-60">
            {charging ? "⚡" : label}
          </span>
          <span className="mt-0.5 text-[10px] font-semibold tabular-nums">
            {Math.round(clamped)}
          </span>
        </span>
      </span>
    </MotionDockItem>
  );
}
