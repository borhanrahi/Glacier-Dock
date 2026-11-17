/**
 * Theme controller: all visual state is written to CSS custom properties on
 * `<html>`, so a preset / accent / tint change repaints every window and widget
 * without a single React re-render.
 */

import { isDaytime } from "./solar";

export type PresetName = "liquid-glass" | "ios-glass" | "midnight" | "black" | "white" | "prism";

export const PRESETS: PresetName[] = [
  "liquid-glass",
  "ios-glass",
  "midnight",
  "black",
  "white",
  "prism",
];

/** Base surface colour per preset, used to rebuild `--glacier-surface` with a
 *  live tint alpha. Kept in sync with glacier-tokens.css. */
const PRESET_BASE: Record<PresetName, [number, number, number]> = {
  "liquid-glass": [16, 20, 28],
  "ios-glass": [255, 255, 255],
  midnight: [20, 24, 36],
  black: [13, 15, 20],
  white: [244, 246, 250],
  prism: [24, 24, 34],
};

function normalizePreset(name: string): PresetName {
  return (PRESETS as string[]).includes(name) ? (name as PresetName) : "liquid-glass";
}

const root = () => document.documentElement;

export function applyPreset(name: string) {
  const preset = normalizePreset(name);
  root().dataset.glacierPreset = preset;
  const [r, g, b] = PRESET_BASE[preset];
  const alpha = parseFloat(root().style.getPropertyValue("--glacier-tint-alpha") || "0.78");
  const topA = Math.min(1, alpha * 0.92).toFixed(3);
  const botA = Math.min(1, alpha * 1.12).toFixed(3);
  root().style.setProperty("--glacier-surface", `rgba(${r}, ${g}, ${b}, ${alpha})`);
  root().style.setProperty(
    "--glacier-dock-bg",
    `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, ${topA}) 0%, rgba(${r}, ${g}, ${b}, ${botA}) 100%)`,
  );
}

export function applyTintAlpha(alpha: number) {
  const clamped = Math.min(1, Math.max(0, alpha));
  root().style.setProperty("--glacier-tint-alpha", String(clamped));
  const preset = normalizePreset(root().dataset.glacierPreset ?? "liquid-glass");
  const [r, g, b] = PRESET_BASE[preset];
  const topA = Math.min(1, clamped * 0.92).toFixed(3);
  const botA = Math.min(1, clamped * 1.12).toFixed(3);
  root().style.setProperty("--glacier-surface", `rgba(${r}, ${g}, ${b}, ${clamped})`);
  root().style.setProperty(
    "--glacier-dock-bg",
    `linear-gradient(180deg, rgba(${r}, ${g}, ${b}, ${topA}) 0%, rgba(${r}, ${g}, ${b}, ${botA}) 100%)`,
  );
}

export function applyAccent(hex: string) {
  root().style.setProperty("--glacier-accent", hex);
}

export function applyBackdrop(mode: string) {
  root().dataset.glacierBackdrop = mode;
}

export interface DockMetrics {
  iconSize: number;
  barHeight: number;
  radius: number;
  edgeMargin: number;
}

export function applyDockMetrics({ iconSize, barHeight, radius, edgeMargin }: DockMetrics) {
  root().style.setProperty("--glacier-icon-base", `${iconSize}px`);
  root().style.setProperty("--glacier-bar-height", `${barHeight}px`);
  root().style.setProperty("--glacier-radius", `${radius}px`);
  root().style.setProperty("--glacier-edge-margin", `${edgeMargin}px`);
}

export interface SolarScheduleOptions {
  enabled: boolean;
  latitude: number;
  longitude: number;
  dayPreset: string;
  nightPreset: string;
  onChange?: (preset: PresetName) => void;
}

/**
 * Auto Day/Night Solar Schedule. Re-evaluates on every sunrise/sunset boundary
 * and at most once a minute, so a laptop waking from sleep converges quickly.
 */
export function startSolarSchedule(options: SolarScheduleOptions): () => void {
  let timer: number | undefined;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    if (options.enabled) {
      const preset = normalizePreset(
        isDaytime(options.latitude, options.longitude) ? options.dayPreset : options.nightPreset,
      );
      applyPreset(preset);
      options.onChange?.(preset);
    }
    timer = window.setTimeout(tick, 60_000);
  };

  tick();
  return () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
