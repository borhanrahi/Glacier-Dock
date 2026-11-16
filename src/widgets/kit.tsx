/**
 * Widget kit: the shared visual shell, storage-backed editors and the small
 * amount of astronomy/time math the catalog needs.
 *
 * Widgets stay declarative and around 20 lines each because everything
 * reusable lives here.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useWidgetStorage } from "../sdk/hooks";
import glacier from "../sdk/bridge";

/* ------------------------------------------------------------------ format */

export function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

export function bps(value: number): string {
  return `${bytes(value)}/s`;
}

export function uptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

/* -------------------------------------------------------------------- math */

/** NOAA solar position approximation (accurate to a few minutes). */
export function solarTimes(date: Date, latitude: number, longitude: number) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + 0.5);

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = latitude * rad;
  const cosHour =
    Math.cos(90.833 * rad) / (Math.cos(latRad) * Math.cos(decl)) - Math.tan(latRad) * Math.tan(decl);
  if (cosHour > 1 || cosHour < -1) return { sunrise: null, sunset: null, dayLength: null };

  const hourAngle = Math.acos(cosHour) / rad;
  const minutesToDate = (minutes: number) => {
    const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) + minutes * 60_000;
    return new Date(utc);
  };

  return {
    sunrise: minutesToDate(720 - 4 * (longitude + hourAngle) - eqTime),
    sunset: minutesToDate(720 - 4 * (longitude - hourAngle) - eqTime),
    dayLength: (8 * hourAngle) / 60,
  };
}

const MOON_NAMES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];

export function moonPhase(date: Date): { name: string; illumination: number; glyph: string } {
  const synodic = 29.530_588_853;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNewMoon) / 86_400_000;
  const age = ((days % synodic) + synodic) % synodic;
  const phase = age / synodic;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const index = Math.round(phase * 8) % 8;
  const glyphs = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  return { name: MOON_NAMES[index], illumination, glyph: glyphs[index] };
}

export function season(date: Date, southern = false): string {
  const month = date.getMonth();
  const north = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"];
  const name = north[month];
  if (!southern) return name;
  return { Winter: "Summer", Spring: "Autumn", Summer: "Winter", Autumn: "Spring" }[name] ?? name;
}

export function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------------- shell */

export function WidgetFrame({
  title,
  hint,
  live,
  children,
}: {
  title: string;
  hint?: string;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col gap-2 rounded-2xl border border-[var(--glacier-border)] bg-[var(--glacier-surface)] p-3 text-[var(--glacier-text)] shadow-[var(--glacier-specular)]">
      <header className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--glacier-text-muted)]">
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
          {hint && (
            <span className="max-w-[9rem] truncate text-[10px] text-[var(--glacier-text-muted)]">
              {hint}
            </span>
          )}
        </span>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-[var(--glacier-text-muted)]">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums" style={{ color: tone }}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal opacity-60">{unit}</span>}
      </span>
    </div>
  );
}

export function Spark({
  values,
  height = 30,
  color = "var(--glacier-accent)",
  max,
}: {
  values: number[];
  height?: number;
  color?: string;
  max?: number;
}) {
  const width = 120;
  const limit = max ?? Math.max(...values, 1);
  const points = values.length
    ? values
        .map((value, index) => {
          const x = (index / Math.max(1, values.length - 1)) * width;
          const y = height - (Math.min(value, limit) / limit) * (height - 2) - 1;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : `0,${height - 1} ${width},${height - 1}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Ring({
  value,
  center,
  label,
  color = "var(--glacier-accent)",
  size = 96,
}: {
  value: number;
  center?: string;
  label?: string;
  color?: string;
  size?: number;
}) {
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--glacier-border)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-base font-semibold tabular-nums">{center ?? `${Math.round(clamped)}%`}</span>
        {label && <span className="mt-1 text-[9px] uppercase tracking-wider opacity-60">{label}</span>}
      </div>
    </div>
  );
}

export function Bars({
  items,
  max,
}: {
  items: Array<{ label: string; value: number; unit?: string; color?: string }>;
  max?: number;
}) {
  const limit = max ?? Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-[10px]">
          <span className="w-14 shrink-0 truncate text-[var(--glacier-text-muted)]">{item.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, (Math.min(item.value, limit) / limit) * 100)}%`,
                background: item.color ?? "var(--glacier-accent)",
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right tabular-nums">
            {Math.round(item.value)}
            {item.unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1 text-[11px] last:border-0">
      <span className="shrink-0 text-[var(--glacier-text-muted)]">{label}</span>
      <span className={`truncate text-right ${mono ? "font-mono text-[10px]" : ""}`}>{value}</span>
    </div>
  );
}

export function MiniButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-40 ${
        active
          ? "bg-[var(--glacier-accent)]/25 text-[var(--glacier-text)]"
          : "bg-white/10 hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({
  value,
  onChange,
  placeholder,
  mono,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEnter?.();
      }}
      className={`w-full rounded-md border border-[var(--glacier-border)] bg-black/20 px-2 py-1 text-[11px] outline-none placeholder:opacity-40 focus:border-[var(--glacier-accent)] ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}

export function Unavailable({ what, requires }: { what: string; requires: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 rounded-lg border border-dashed border-[var(--glacier-border)] p-2 text-[10px] leading-snug text-[var(--glacier-text-muted)]">
      <span className="text-[11px] font-semibold text-[var(--glacier-text)]">{what} unavailable</span>
      <span>{requires}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-2 text-center text-[10px] leading-snug text-[var(--glacier-text-muted)]">
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- editors */

export function Checklist({
  id,
  storageKey,
  initial,
  placeholder,
}: {
  id: string;
  storageKey: string;
  initial: string[];
  placeholder: string;
}) {
  const [items, setItems] = useWidgetStorage<string[]>(id, storageKey, []);
  const [done, setDone] = useWidgetStorage<string[]>(id, `${storageKey}Done`, []);
  const [draft, setDraft] = useWidgetStorage<string>(id, `${storageKey}Draft`, "");
  const list = items.length ? items : initial;

  const toggle = (item: string) =>
    setDone((previous) => (previous.includes(item) ? previous.filter((x) => x !== item) : [...previous, item]));

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setItems((previous) => [...(previous.length ? previous : initial), text]);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col gap-1.5 text-[11px]">
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {list.map((item) => (
          <label key={item} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={done.includes(item)}
              onChange={() => toggle(item)}
              className="size-3 accent-[var(--glacier-accent)]"
            />
            <span className={done.includes(item) ? "line-through opacity-40" : ""}>{item}</span>
          </label>
        ))}
        {list.length === 0 && <Empty>Nothing here yet.</Empty>}
      </div>
      <Field value={draft} onChange={setDraft} placeholder={placeholder} onEnter={add} />
    </div>
  );
}

export function NotePad({
  id,
  storageKey,
  placeholder,
  rows = 6,
}: {
  id: string;
  storageKey: string;
  placeholder: string;
  rows?: number;
}) {
  const [text, setText] = useWidgetStorage<string>(id, storageKey, "");
  return (
    <textarea
      value={text}
      rows={rows}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      className="h-full w-full resize-none rounded-lg border border-[var(--glacier-border)] bg-black/20 p-2 text-[11px] leading-snug outline-none placeholder:opacity-40 focus:border-[var(--glacier-accent)]"
    />
  );
}

export function Counter({
  id,
  storageKey = "count",
  initial = 0,
  step = 1,
  unit,
  goal,
}: {
  id: string;
  storageKey?: string;
  initial?: number;
  step?: number;
  unit: string;
  goal?: number;
}) {
  const [count, setCount] = useWidgetStorage<number>(id, storageKey, initial);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <span className="text-2xl font-semibold tabular-nums">
        {count}
        <span className="ml-1 text-xs font-normal opacity-60">{unit}</span>
      </span>
      {goal ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[var(--glacier-accent)] transition-[width]"
            style={{ width: `${Math.min(100, (count / goal) * 100)}%` }}
          />
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <MiniButton onClick={() => setCount((value) => Math.max(0, value - step))}>−</MiniButton>
        <MiniButton onClick={() => setCount((value) => value + step)}>+</MiniButton>
      </div>
    </div>
  );
}

export function LinkList({
  id,
  storageKey,
  initial,
}: {
  id: string;
  storageKey: string;
  initial: Array<{ label: string; target: string }>;
}) {
  const [items, setItems] = useWidgetStorage<Array<{ label: string; target: string }>>(id, storageKey, []);
  const [label, setLabel] = useWidgetStorage<string>(id, `${storageKey}Label`, "");
  const [target, setTarget] = useWidgetStorage<string>(id, `${storageKey}Target`, "");
  const list = items.length ? items : initial;

  const add = () => {
    if (!label.trim() || !target.trim()) return;
    setItems((previous) => [...(previous.length ? previous : initial), { label, target }]);
    setLabel("");
    setTarget("");
  };

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {list.map((item) => (
          <button
            key={`${item.label}-${item.target}`}
            type="button"
            onClick={() => glacier.system.openPath(item.target).catch(() => {})}
            className="flex w-full items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1 text-left text-[11px] hover:bg-white/15"
          >
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 text-[9px] opacity-50">open</span>
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <Field value={label} onChange={setLabel} placeholder="Label" />
        <Field value={target} onChange={setTarget} placeholder="Path / URL" onEnter={add} />
      </div>
    </div>
  );
}

/**
 * Sliding window of the last `length` samples, advanced by the telemetry
 * frame sequence so a flat value (0% CPU) still moves the window forward.
 */
export function useHistory(value: number, seq: number, length = 40): number[] {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    setHistory((previous) => [...previous, value].slice(-length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, length]);
  return history;
}
