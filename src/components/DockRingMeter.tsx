/**
 * Compact OpenTaskbar-style circular RingMeter pill for live dock telemetry
 * (CPU, RAM, GPU, Battery) using Glacier's Aurora & threshold palette.
 */

export interface DockRingMeterProps {
  label: string;
  value: number;
  tooltip: string;
  vertical?: boolean;
  charging?: boolean;
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
  vertical = false,
  charging = false,
  onClick,
}: DockRingMeterProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const stroke = ringStrokeColor(label, clamped, charging);

  return (
    <button
      data-no-drag
      type="button"
      aria-label={tooltip}
      onClick={onClick}
      className="group glacier-widget-pill glacier-icon-glow relative grid shrink-0 place-items-center transition-transform duration-150 active:scale-95"
      style={{
        width: "calc(var(--glacier-icon-base) * 0.94)",
        height: "calc(var(--glacier-icon-base) * 0.94)",
      }}
    >
      {!vertical && <span className="glacier-dock-tip">{tooltip}</span>}
      <svg viewBox="0 0 36 36" className="size-[34px] -rotate-90" aria-hidden>
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
    </button>
  );
}
