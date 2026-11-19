/**
 * Seven-tab settings surface: Appearance, Dock, Widgets & Store, Automations,
 * Telemetry, Advanced, About.
 *
 * The window edits one `AppConfig` object, previews appearance changes live via
 * the CSS-token theme controller, and persists through `save_config`.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { motion } from "motion/react";
import {
  Activity,
  AppWindow,
  Check,
  Info,
  LayoutGrid,
  Palette,
  Pipette,
  SlidersHorizontal,
  Zap,
} from "lucide-react";

import glacier, { type InstalledWidget } from "../sdk/bridge";
import { useAppIcon, useTelemetry } from "../sdk/hooks";
import { MAC_TAB_SPRING } from "../sdk/motion";
import type { InstalledApp, PinnedApp } from "../utils/apps";
import { applyAccent } from "../styles/theme";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  WIDGETS,
  searchWidgets,
  widgetMeta,
  type WidgetCategory,
} from "../widgets/registry";

type TabId = "appearance" | "dock" | "widgets" | "automations" | "telemetry" | "advanced" | "about";

interface AppearanceCfg {
  preset: string;
  iconPlate?: string;
  backdrop: string;
  tintAlpha: number;
  accent: string;
  solarAuto: boolean;
  solarDayPreset: string;
  solarNightPreset: string;
  chameleonTint: boolean;
  magnification: number;
  size: "small" | "medium" | "large";
  shape: "floating" | "attached";
  edgeMargin: number;
  widthMode: "fitcontent" | "full";
}

interface DockCfg {
  monitor: string;
  edge: "bottom" | "top" | "left" | "right";
  shape: "floating" | "attached";
  widthMode: "fitcontent" | "full";
  size: "small" | "medium" | "large";
  widgets: string[];
}

interface ProfileCfg {
  name: string;
  triggers: string[];
  widgets: string[];
  color: string;
}

interface AutomationCfg {
  preMeetingPause: boolean;
  autoDnd: boolean;
  aiQuotaAlerts: boolean;
  renewalReminders: boolean;
  intelliHide: boolean;
  lowBatteryPowerShift: boolean;
}

interface TelemetryCfg {
  enabled: boolean;
  intervalMs: number;
  topProcess: boolean;
  network: boolean;
}

interface AdvancedCfg {
  hardwareAcceleration: boolean;
  startWithWindows: boolean;
  checkUpdates: boolean;
  storeUrl: string;
  flyoutLingerMs: number;
}

interface SettingsConfig {
  replaceTaskbar: boolean;
  showTelemetryRings?: boolean;
  showAiUsage?: boolean;
  showQuickFolders?: boolean;
  appearance: AppearanceCfg;
  docks: DockCfg[];
  profiles: ProfileCfg[];
  activeProfile: string;
  automations: AutomationCfg;
  telemetry: TelemetryCfg;
  advanced: AdvancedCfg;
  pinnedApps: PinnedApp[];
  dockWidgets: string[];
  latitude: number;
  longitude: number;
}

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: "appearance", label: "Appearance", icon: <Palette className="size-4" strokeWidth={1.8} /> },
  { id: "dock", label: "Dock", icon: <AppWindow className="size-4" strokeWidth={1.8} /> },
  { id: "widgets", label: "Widgets & Store", icon: <LayoutGrid className="size-4" strokeWidth={1.8} /> },
  { id: "automations", label: "Automations", icon: <Zap className="size-4" strokeWidth={1.8} /> },
  { id: "telemetry", label: "Telemetry", icon: <Activity className="size-4" strokeWidth={1.8} /> },
  { id: "advanced", label: "Advanced", icon: <SlidersHorizontal className="size-4" strokeWidth={1.8} /> },
  { id: "about", label: "About", icon: <Info className="size-4" strokeWidth={1.8} /> },
];

const PRESETS: Array<{
  id: string;
  label: string;
  rgb: [number, number, number];
  light?: boolean;
  swatch: string;
}> = [
  {
    id: "liquid-glass",
    label: "Liquid Glass",
    rgb: [16, 20, 28],
    swatch: "linear-gradient(135deg,#0f172a,#1e3a5f 60%,#38bdf8)",
  },
  {
    id: "ios-glass",
    label: "iOS Glass",
    rgb: [245, 248, 255],
    light: true,
    swatch: "linear-gradient(135deg,#cbd5e1,#f8fafc)",
  },
  {
    id: "midnight",
    label: "Midnight",
    rgb: [20, 24, 36],
    swatch: "linear-gradient(135deg,#0b1120,#1e293b)",
  },
  {
    id: "prism",
    label: "Prism",
    rgb: [24, 24, 34],
    swatch: "linear-gradient(135deg,#181826,#7c3aed)",
  },
  {
    id: "black",
    label: "Black",
    rgb: [10, 12, 16],
    swatch: "linear-gradient(135deg,#050608,#18181b)",
  },
  {
    id: "white",
    label: "White",
    rgb: [244, 246, 250],
    light: true,
    swatch: "linear-gradient(135deg,#e2e8f0,#ffffff)",
  },
];

const ACCENT_SWATCHES = [
  "#38BDF8",
  "#5EEAD4",
  "#818CF8",
  "#A78BFA",
  "#F472B6",
  "#FB923C",
  "#34D399",
  "#E2E8F0",
];

/* ------------------------------------------------------------- primitives */

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <header className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {title}
        </h3>
        {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#111827]/80 px-3.5 py-2.5 text-left transition hover:border-white/[0.13] hover:bg-[#151e30]"
    >
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-slate-100">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{hint}</span>}
      </span>
      <span
        className="relative h-5 w-9 shrink-0 rounded-full transition-all duration-200"
        style={{
          background: checked ? "var(--glacier-accent)" : "rgba(255,255,255,0.14)",
          boxShadow: checked ? "0 0 12px rgba(56, 189, 248, 0.35)" : "none",
        }}
      >
        <span
          className="absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left] duration-200"
          style={{ left: checked ? 18 : 2 }}
        />
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (next: number) => void;
}) {
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <label className="block rounded-xl border border-white/[0.07] bg-[#111827]/80 px-3.5 py-2.5 transition hover:border-white/[0.13]">
      <span className="flex items-center justify-between text-[12px]">
        <span className="font-medium text-slate-100">{label}</span>
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium tabular-nums text-sky-300">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="glacier-slider mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
        style={{
          background: `linear-gradient(to right, var(--glacier-accent) 0%, var(--glacier-accent) ${pct}%, rgba(255,255,255,0.12) ${pct}%, rgba(255,255,255,0.12) 100%)`,
        }}
      />
    </label>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#0d1320] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11.5px] transition-colors ${
            value === option.value
              ? "bg-sky-400/15 font-semibold text-sky-200 ring-1 ring-sky-400/35 shadow-sm"
              : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111827]/80 px-3.5 py-2.5 text-[12px]">
      <span className="shrink-0 font-medium text-slate-200">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="w-56 rounded-lg border border-white/[0.08] bg-[#090d16] px-2.5 py-1 text-right text-[11.5px] text-slate-100 outline-none focus:border-[var(--glacier-accent)]"
      />
    </label>
  );
}

/* ----------------------------------------------------------------- window */

export default function SettingsWindow() {
  const [tab, setTab] = useState<TabId>("appearance");
  const [cfg, setCfg] = useState<SettingsConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Loading configuration…");
  const frame = useTelemetry();

  useEffect(() => {
    invoke<SettingsConfig>("get_config")
      .then((loaded) => {
        setCfg(loaded);
        setStatus("Ready");
      })
      .catch((error: unknown) => setStatus(String(error)));
  }, []);

  // Only propagate accent CSS var inside SettingsWindow so dock tintAlpha never washes out Settings.
  useEffect(() => {
    if (!cfg) return;
    applyAccent(cfg.appearance.accent);
  }, [cfg]);

  const patch = <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => {
    setCfg((previous) => (previous ? { ...previous, [key]: value } : previous));
    setDirty(true);
  };

  const patchAppearance = (value: Partial<AppearanceCfg>) => {
    setCfg((previous) =>
      previous ? { ...previous, appearance: { ...previous.appearance, ...value } } : previous,
    );
    setDirty(true);
  };

  const save = async () => {
    if (!cfg) return;
    try {
      await invoke("save_config", { cfg });
      setDirty(false);
      setStatus("Saved just now");
    } catch (error) {
      setStatus(String(error));
    }
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#0b101b] text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 40% at 62% 0%, rgba(56, 189, 248, 0.10), transparent 70%)",
        }}
      />

      <aside className="relative z-10 flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-[#070b13] p-3.5">
        <div data-tauri-drag-region className="mb-5 flex items-center gap-2.5 px-1.5 py-1.5">
          <span
            className="grid size-8 place-items-center rounded-xl text-sm font-bold text-[#08111d] shadow-md"
            style={{ background: "var(--glacier-aurora)" }}
          >
            ❄
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-none text-white">Glacier Dock</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-widest text-slate-400">
              Settings
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {TABS.map((entry) => {
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors ${
                  active
                    ? "bg-white/[0.08] font-semibold text-white"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="settings-active-tab"
                    transition={MAC_TAB_SPRING}
                    className="absolute left-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
                    style={{ background: "var(--glacier-aurora)" }}
                  />
                )}
                <span className={`grid w-4 place-items-center ${active ? "text-sky-300" : "opacity-75"}`}>
                  {entry.icon}
                </span>
                {entry.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-[10px] leading-relaxed text-slate-400">
          Everything is stored locally in {`%APPDATA%\\GlacierDock`}. No telemetry leaves this
          machine.
        </div>
      </aside>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          className="flex items-center justify-between border-b border-white/[0.07] bg-[#0b101b]/90 px-6 py-3.5"
        >
          <div>
            <h1 className="text-[15px] font-semibold text-white">
              {TABS.find((entry) => entry.id === tab)?.label}
            </h1>
            <p className="text-[11px] text-slate-400">{status}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => glacier.system.launcher().catch(() => {})}
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:bg-white/[0.10]"
            >
              Launchpad
            </button>
            <button
              type="button"
              onClick={() => glacier.system.hide().catch(() => {})}
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:bg-white/[0.10]"
            >
              Close
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!cfg ? (
            <p className="text-[12px] text-slate-400">Loading…</p>
          ) : (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === "appearance" ? (
                <AppearanceTab cfg={cfg} patchAppearance={patchAppearance} patch={patch} />
              ) : tab === "dock" ? (
                <DockTab cfg={cfg} patch={patch} />
              ) : tab === "widgets" ? (
                <WidgetsTab cfg={cfg} patch={patch} />
              ) : tab === "automations" ? (
                <AutomationsTab cfg={cfg} patch={patch} />
              ) : tab === "telemetry" ? (
                <TelemetryTab cfg={cfg} patch={patch} frame={frame} />
              ) : tab === "advanced" ? (
                <AdvancedTab cfg={cfg} patch={patch} />
              ) : (
                <AboutTab />
              )}
            </motion.div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-white/[0.07] bg-[#080c15] px-6 py-3">
          <span className="text-[11px] text-slate-400">
            {dirty ? "Unsaved changes" : "All changes saved"} · {WIDGETS.length} widgets in the catalog
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                invoke<SettingsConfig>("reset_config")
                  .then((reset) => {
                    setCfg(reset);
                    setDirty(false);
                    setStatus("Restored defaults");
                  })
                  .catch(() => {})
              }
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:bg-white/[0.10]"
            >
              Restore defaults
            </button>
            <button
              type="button"
              onClick={() => invoke<SettingsConfig>("get_config").then((loaded) => {
                setCfg(loaded);
                setDirty(false);
                setStatus("Reverted");
              })}
              className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:bg-white/[0.10]"
            >
              Revert
            </button>
            <button
              type="button"
              disabled={!dirty}
              onClick={save}
              className="rounded-lg px-3.5 py-1.5 text-[11.5px] font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-35"
              style={{ background: "var(--glacier-accent)" }}
            >
              Save changes
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------- tabs */

function AppearanceTab({
  cfg,
  patchAppearance,
  patch,
}: {
  cfg: SettingsConfig;
  patchAppearance: (value: Partial<AppearanceCfg>) => void;
  patch: <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => void;
}) {
  const appearance = cfg.appearance;
  const activePreset = PRESETS.find((p) => p.id === appearance.preset) ?? PRESETS[0];
  const [pr, pg, pb] = activePreset.rgb;
  const topA = Math.min(1, appearance.tintAlpha * 0.92).toFixed(3);
  const botA = Math.min(1, appearance.tintAlpha * 1.12).toFixed(3);

  return (
    <>
      <Section title="Live preview" hint={`${appearance.preset} · ${Math.round(appearance.tintAlpha * 100)}% tint`}>
        <div
          className="relative flex h-28 items-end justify-center overflow-hidden rounded-2xl border border-white/[0.08] pb-3 shadow-inner"
          style={{
            background:
              "radial-gradient(circle at 18% 20%, rgba(56, 189, 248, 0.30), transparent 52%), radial-gradient(circle at 82% 28%, rgba(167, 139, 250, 0.25), transparent 48%), linear-gradient(180deg, #091326 0%, #102038 100%)",
          }}
        >
          <div
            className="relative flex items-center gap-2 rounded-2xl border px-3 py-1.5 backdrop-blur-md"
            style={{
              background: `linear-gradient(180deg, rgba(${pr}, ${pg}, ${pb}, ${topA}) 0%, rgba(${pr}, ${pg}, ${pb}, ${botA}) 100%)`,
              borderColor: activePreset.light ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.16)",
              color: activePreset.light ? "#0f172a" : "#f1f5f9",
              boxShadow: "0 10px 28px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.22)",
            }}
          >
            {[appearance.accent, "#5EEAD4", "#818CF8", "#F472B6"].map((bg, idx) => (
              <span key={`${bg}-${idx}`} className="relative grid size-7 place-items-center rounded-lg shadow-sm" style={{ background: bg }}>
                {idx === 0 && (
                  <span
                    className="absolute -bottom-1 h-[2.5px] w-3 rounded-full"
                    style={{ background: appearance.accent }}
                  />
                )}
              </span>
            ))}
            <span className={`mx-0.5 h-5 w-px ${activePreset.light ? "bg-slate-900/15" : "bg-white/15"}`} />
            <span
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold tabular-nums ${
                activePreset.light ? "bg-slate-900/10 text-slate-900" : "bg-white/10 text-slate-100"
              }`}
            >
              14:32
            </span>
          </div>
        </div>
      </Section>

      <Section title="Preset" hint="Applies to every dock & glass overlay">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {PRESETS.map((preset) => {
            const active = appearance.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => patchAppearance({ preset: preset.id })}
                className={`group relative rounded-xl border p-2 text-left transition ${
                  active
                    ? "border-sky-400/70 bg-sky-400/10 ring-1 ring-sky-400/35"
                    : "border-white/[0.07] bg-[#111827]/80 hover:border-white/[0.14] hover:bg-[#151e30]"
                }`}
              >
                <span
                  className="mb-2 flex h-11 items-end justify-center rounded-lg p-1.5 shadow-inner"
                  style={{ background: preset.swatch }}
                >
                  <span
                    className={`h-2 w-8 rounded-full ${
                      preset.light ? "bg-slate-900/25" : "bg-white/30"
                    }`}
                  />
                </span>
                <span className="flex items-center justify-between text-[11px] font-medium text-slate-200">
                  <span>{preset.label}</span>
                  {active && <Check className="size-3 text-sky-300" />}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Tint & accent">
        <Slider
          label="Tint opacity"
          value={Number(appearance.tintAlpha.toFixed(2))}
          min={0}
          max={1}
          step={0.02}
          onChange={(value) => patchAppearance({ tintAlpha: value })}
        />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111827]/80 px-3.5 py-2.5 text-[12px]">
          <span className="font-medium text-slate-100">Accent colour</span>
          <div className="flex items-center gap-1.5">
            {ACCENT_SWATCHES.map((swatch) => {
              const selected = appearance.accent.toLowerCase() === swatch.toLowerCase();
              return (
                <button
                  key={swatch}
                  type="button"
                  title={swatch}
                  onClick={() => patchAppearance({ accent: swatch })}
                  className={`size-5 rounded-full transition-transform hover:scale-110 ${
                    selected ? "ring-2 ring-white ring-offset-2 ring-offset-[#111827]" : "ring-1 ring-white/20"
                  }`}
                  style={{ background: swatch }}
                />
              );
            })}
            <label
              title="Custom colour"
              className="relative grid size-6 cursor-pointer place-items-center rounded-full border border-white/20 bg-white/5 transition hover:bg-white/15"
              style={{ background: appearance.accent }}
            >
              <Pipette className="size-3 text-slate-950 drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]" />
              <input
                type="color"
                value={appearance.accent}
                onChange={(event) => patchAppearance({ accent: event.target.value })}
                className="sr-only"
              />
            </label>
          </div>
        </div>
        <Toggle
          label="Chameleon tint"
          hint="Tint the glass with the current wallpaper accent."
          checked={appearance.chameleonTint}
          onChange={(value) => patchAppearance({ chameleonTint: value })}
        />
        <Slider
          label="Magnification"
          value={appearance.magnification}
          min={0}
          max={2.0}
          step={0.05}
          onChange={(value) =>
            patchAppearance({
              magnification:
                value < 1.1 && value > 0
                  ? appearance.magnification > 0.5
                    ? 0
                    : 1.15
                  : value,
            })
          }
        />
      </Section>

      <Section title="Icon plates & custom icon packs" hint="OpenTaskbar-style icon framing">
        <Segmented
          value={(appearance.iconPlate ?? "none") as "none" | "squircle" | "circle" | "leaf" | "petal"}
          options={[
            { value: "none", label: "None" },
            { value: "squircle", label: "Squircle" },
            { value: "circle", label: "Circle" },
            { value: "leaf", label: "Leaf" },
            { value: "petal", label: "Petal" },
          ]}
          onChange={(value) => patchAppearance({ iconPlate: value })}
        />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#111827]/80 px-3.5 py-2.5 text-[11.5px]">
          <span className="text-slate-300">
            Drop <code className="rounded bg-black/40 px-1.5 py-0.5 text-[10.5px] text-sky-300">appname.png</code> or{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[10.5px] text-sky-300">.svg</code> into your Icons folder.
          </span>
          <button
            type="button"
            onClick={() => invoke("open_icons_dir").catch(() => {})}
            className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/[0.12]"
          >
            Open Icons Folder
          </button>
        </div>
      </Section>

      <Section title="Solar schedule" hint="Auto day/night presets">
        <Toggle
          label="Follow the sun"
          hint="Switch presets at sunrise and sunset using the coordinates below."
          checked={appearance.solarAuto}
          onChange={(value) => patchAppearance({ solarAuto: value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Day preset"
            value={appearance.solarDayPreset}
            onChange={(value) => patchAppearance({ solarDayPreset: value })}
          />
          <TextField
            label="Night preset"
            value={appearance.solarNightPreset}
            onChange={(value) => patchAppearance({ solarNightPreset: value })}
          />
          <TextField
            label="Latitude"
            value={String(cfg.latitude)}
            onChange={(value) => patch("latitude", Number(value) || 0)}
          />
          <TextField
            label="Longitude"
            value={String(cfg.longitude)}
            onChange={(value) => patch("longitude", Number(value) || 0)}
          />
        </div>
      </Section>
    </>
  );
}

function SmallAppIcon({ path }: { path: string }) {
  const icon = useAppIcon(path);
  return (
    <span className="grid size-6 shrink-0 place-items-center">
      {icon ? (
        <img src={icon} alt="" draggable={false} className="size-6 object-contain" />
      ) : (
        <span className="size-6 rounded-md bg-white/10" />
      )}
    </span>
  );
}

function PinRow({
  app,
  first,
  last,
  onUp,
  onDown,
  onRemove,
}: {
  app: PinnedApp;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-[#111827]/80 px-3 py-2">
      <SmallAppIcon path={app.path} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-200">{app.name}</span>
      <button type="button" disabled={first} onClick={onUp} className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-25">
        ↑
      </button>
      <button type="button" disabled={last} onClick={onDown} className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-25">
        ↓
      </button>
      <button type="button" onClick={onRemove} className="rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-rose-500/20 hover:text-rose-300">
        ×
      </button>
    </div>
  );
}

/** Dock contents: explicit pins, edited here instead of auto-detected. */
function PinnedAppsSection({
  cfg,
  patch,
}: {
  cfg: SettingsConfig;
  patch: <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => void;
}) {
  const [library, setLibrary] = useState<InstalledApp[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    invoke<InstalledApp[]>("installed_apps", { limit: 400 })
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }, []);

  const pins = cfg.pinnedApps ?? [];
  const setPins = (next: PinnedApp[]) => patch("pinnedApps", next);
  const has = (path: string) => pins.some((pin) => pin.path === path);

  const matches = query.trim()
    ? library.filter((app) => app.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : library.slice(0, 6);

  const move = (index: number, delta: number) => {
    const next = [...pins];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPins(next);
  };

  return (
    <Section title="Dock apps" hint={`${pins.length} pinned`}>
      {pins.length === 0 && (
        <p className="text-[11.5px] text-slate-500">The dock is empty. Add an app below.</p>
      )}
      {pins.map((app, index) => (
        <PinRow
          key={app.path}
          app={app}
          first={index === 0}
          last={index === pins.length - 1}
          onUp={() => move(index, -1)}
          onDown={() => move(index, 1)}
          onRemove={() => setPins(pins.filter((pin) => pin.path !== app.path))}
        />
      ))}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search installed apps to add…"
        className="w-full rounded-xl border border-white/[0.08] bg-[#090d16] px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-[var(--glacier-accent)]"
      />
      <div className="space-y-1">
        {matches.map((app) => {
          const isPinned = has(app.path);
          return (
            <div key={app.path} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition hover:bg-white/[0.04]">
              <SmallAppIcon path={app.path} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">{app.name}</span>
              <button
                type="button"
                disabled={isPinned}
                onClick={() => setPins([...pins, { name: app.name, path: app.path }])}
                className={`rounded-lg px-2.5 py-1 text-[10.5px] font-medium transition ${
                  isPinned
                    ? "bg-white/[0.05] text-slate-500"
                    : "bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/30 hover:bg-sky-400/25"
                }`}
              >
                {isPinned ? "Pinned" : "+ Pin"}
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function DockTab({
  cfg,
  patch,
}: {
  cfg: SettingsConfig;
  patch: <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => void;
}) {
  const first = cfg.docks[0];

  return (
    <>
      <Section title="System integration">
        <Toggle
          label="Start permanently with Windows"
          hint="Registers Glacier Dock in Windows Startup so it launches automatically on sign-in."
          checked={cfg.advanced.startWithWindows}
          onChange={(value) =>
            patch("advanced", { ...cfg.advanced, startWithWindows: value })
          }
        />
        <Toggle
          label="Replace the Windows taskbar"
          hint="Hides explorer's taskbar and restores it on exit or crash."
          checked={cfg.replaceTaskbar}
          onChange={(value) => patch("replaceTaskbar", value)}
        />
        <button
          type="button"
          onClick={() => invoke("restore_native_taskbar").catch(() => {})}
          className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3.5 py-2 text-[11.5px] font-medium text-slate-200 transition hover:bg-white/[0.10]"
        >
          Restore the Windows taskbar now
        </button>
      </Section>

      <Section title="Dock features" hint="Turn individual dock modules on or off">
        <Toggle
          label="Live telemetry rings (CPU / RAM / BAT)"
          hint="Compact circular gauges in the dock island."
          checked={cfg.showTelemetryRings ?? true}
          onChange={(value) => patch("showTelemetryRings", value)}
        />
        <Toggle
          label="AI Plan Usage Island"
          hint="Live quota rings for Claude Code, Codex, OpenCode Go, Gemini & Antigravity."
          checked={cfg.showAiUsage ?? true}
          onChange={(value) => patch("showAiUsage", value)}
        />
        <Toggle
          label="Downloads & Recycle Bin shortcuts"
          hint="Quick-access stack buttons next to system controls."
          checked={cfg.showQuickFolders ?? true}
          onChange={(value) => patch("showQuickFolders", value)}
        />
      </Section>

      <PinnedAppsSection cfg={cfg} patch={patch} />

      <Section title="Geometry">
        <Segmented
          value={cfg.appearance.size}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
          ]}
          onChange={(value) => patch("appearance", { ...cfg.appearance, size: value })}
        />
        <Segmented
          value={cfg.appearance.shape}
          options={[
            { value: "floating", label: "Floating" },
            { value: "attached", label: "Attached" },
          ]}
          onChange={(value) => patch("appearance", { ...cfg.appearance, shape: value })}
        />
        <Segmented
          value={cfg.appearance.widthMode}
          options={[
            { value: "fitcontent", label: "Fit content" },
            { value: "full", label: "Full width" },
          ]}
          onChange={(value) => patch("appearance", { ...cfg.appearance, widthMode: value })}
        />
        <Slider
          label="Edge margin"
          value={cfg.appearance.edgeMargin}
          min={0}
          max={48}
          step={1}
          suffix=" px"
          onChange={(value) => patch("appearance", { ...cfg.appearance, edgeMargin: value })}
        />
      </Section>

      <Section title="Per display" hint={`${cfg.docks.length} dock${cfg.docks.length === 1 ? "" : "s"}`}>
        {cfg.docks.length === 0 ? (
          <p className="text-[11px] opacity-50">
            No dock has been created yet — one is added on the first display change.
          </p>
        ) : (
          cfg.docks.map((dock) => (
            <div
              key={dock.monitor || "primary"}
              className="rounded-xl border border-white/[0.07] bg-[#111827]/80 p-3"
            >
              <div className="mb-2 truncate text-[12px] font-medium text-slate-200">
                {dock.monitor || "Primary display"}
              </div>
              <Segmented
                value={dock.edge}
                options={[
                  { value: "bottom", label: "Bottom" },
                  { value: "top", label: "Top" },
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                ]}
                onChange={(edge) =>
                  patch(
                    "docks",
                    cfg.docks.map((entry) => (entry.monitor === dock.monitor ? { ...entry, edge } : entry)),
                  )
                }
              />
            </div>
          ))
        )}
        {first && (
          <p className="text-[10px] opacity-40">
            Tip: drag the dock itself towards an edge — snapping writes the same setting.
          </p>
        )}
      </Section>
    </>
  );
}

function WidgetsTab({
  cfg,
  patch,
}: {
  cfg: SettingsConfig;
  patch: <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WidgetCategory | "all">("all");
  const [installed, setInstalled] = useState<InstalledWidget[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState(cfg.advanced.storeUrl);
  const [remote, setRemote] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");

  const reload = () => glacier.store.installed().then(setInstalled).catch(() => setInstalled([]));

  useEffect(() => {
    reload();
  }, []);

  const installedIds = useMemo(() => new Set(installed.map((entry) => entry.id)), [installed]);
  const results = useMemo(() => {
    const base = query.trim() ? searchWidgets(query) : WIDGETS;
    return category === "all" ? base : base.filter((widget) => widget.category === category);
  }, [query, category]);

  const install = async (id: string) => {
    const meta = widgetMeta(id);
    if (!meta) return;
    setBusy(id);
    try {
      await glacier.store.install({
        id: meta.id,
        name: meta.name,
        category: meta.category,
        version: "1.0.0",
        author: "Glacier Dock",
        description: meta.description,
        bundled: true,
      });
      await reload();
      emit("glacier://widgets-changed").catch(() => {});
      setMessage(`Installed ${meta.name}`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (id: string) => {
    setBusy(id);
    try {
      await glacier.store.uninstall(id);
      if (cfg.dockWidgets.includes(id)) {
        patch("dockWidgets", cfg.dockWidgets.filter((entry) => entry !== id));
      }
      await reload();
      emit("glacier://widgets-changed").catch(() => {});
      setMessage(`Removed ${id}`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy("index");
    try {
      const index = (await glacier.store.refresh(storeUrl)) as Array<Record<string, unknown>>;
      setRemote(index);
      setMessage(`${index.length} community widgets found`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  const toggleDockWidget = (id: string) => {
    const next = cfg.dockWidgets.includes(id)
      ? cfg.dockWidgets.filter((entry) => entry !== id)
      : [...cfg.dockWidgets, id].slice(-8);
    patch("dockWidgets", next);
  };

  return (
    <>
      <Section title="Dock strip" hint={`${cfg.dockWidgets.length} pinned`}>
        <div className="flex flex-wrap gap-1.5">
          {cfg.dockWidgets.length === 0 && (
            <span className="text-[11px] opacity-50">Nothing pinned. Install a widget, then pin it here.</span>
          )}
          {cfg.dockWidgets.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleDockWidget(id)}
              className="rounded-full bg-[var(--glacier-accent)]/25 px-2.5 py-1 text-[10px] hover:bg-[var(--glacier-accent)]/40"
            >
              {widgetMeta(id)?.name ?? id} ×
            </button>
          ))}
        </div>
      </Section>

      <Section title="Catalog" hint={`${WIDGETS.length} widgets · ${installed.length} installed`}>
        <div className="flex gap-2">
          <input
            value={query}
            placeholder="Search widgets…"
            onChange={(event) => setQuery(event.target.value)}
            className="flex-1 rounded-xl border border-white/[0.08] bg-[#090d16] px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-[var(--glacier-accent)]"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as WidgetCategory | "all")}
            className="rounded-xl border border-white/[0.08] bg-[#090d16] px-3 py-2 text-[12px] text-slate-100 outline-none"
          >
            <option value="all" className="bg-[#0b101b]">
              All categories
            </option>
            {CATEGORY_ORDER.map((key) => (
              <option key={key} value={key} className="bg-[#0b101b]">
                {CATEGORY_META[key].label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid max-h-[46vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1">
          {results.map((widget) => {
            const isInstalled = installedIds.has(widget.id);
            return (
              <div
                key={widget.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#111827]/80 p-3 transition hover:border-white/[0.13]"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-semibold">{widget.name}</span>
                    {widget.status === "integration" && (
                      <span className="shrink-0 rounded bg-amber-400/20 px-1 py-0.5 text-[8px] uppercase tracking-wide text-amber-300">
                        needs API
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug opacity-55">{widget.description}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[8px] uppercase tracking-wider opacity-40">
                    {CATEGORY_META[widget.category].label}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        invoke("open_widget", {
                          id: widget.id,
                          width: widget.width,
                          height: widget.height,
                        }).catch(() => {})
                      }
                      className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] hover:bg-white/20"
                    >
                      open
                    </button>
                    {isInstalled && (
                      <button
                        type="button"
                        onClick={() => toggleDockWidget(widget.id)}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] hover:bg-white/20"
                      >
                        {cfg.dockWidgets.includes(widget.id) ? "unpin" : "pin"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy === widget.id}
                      onClick={() => (isInstalled ? uninstall(widget.id) : install(widget.id))}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium disabled:opacity-40 ${
                        isInstalled
                          ? "bg-white/10 hover:bg-white/20"
                          : "bg-[var(--glacier-accent)] text-slate-950"
                      }`}
                    >
                      {isInstalled ? "remove" : "install"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Community store" hint={message || "1-click install"}>
        <div className="flex gap-2">
          <input
            value={storeUrl}
            placeholder="https://example.com/glacier-index.json"
            onChange={(event) => {
              setStoreUrl(event.target.value);
              patch("advanced", { ...cfg.advanced, storeUrl: event.target.value });
            }}
            className="flex-1 rounded-xl border border-white/[0.08] bg-[#090d16] px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-[var(--glacier-accent)]"
          />
          <button
            type="button"
            disabled={busy === "index" || !storeUrl}
            onClick={refresh}
            className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3.5 py-2 text-[11.5px] font-medium text-slate-200 transition hover:bg-white/[0.10] disabled:opacity-40"
          >
            {busy === "index" ? "Fetching…" : "Refresh"}
          </button>
        </div>
        <p className="text-[9px] leading-snug opacity-40">
          The index is a JSON array of manifests fetched over HTTPS. Installed widgets are stored as
          plain JSON in %APPDATA%\GlacierDock\widgets; no code is downloaded or executed.
        </p>
        {remote.length > 0 && (
          <div className="space-y-1">
            {remote.slice(0, 12).map((entry, index) => {
              const id = String(entry.id ?? `remote-${index}`);
              const name = String(entry.name ?? id);
              const url = String(entry.manifestUrl ?? entry.url ?? storeUrl);
              return (
                <div key={id} className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1">
                  <span className="truncate text-[10px]">{name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      glacier.store
                        .installFromUrl(url)
                        .then(reload)
                        .then(() => emit("glacier://widgets-changed").catch(() => {}))
                        .then(() => setMessage(`Installed ${name}`))
                        .catch((error) => setMessage(String(error)))
                    }
                    className="rounded bg-[var(--glacier-accent)] px-1.5 py-0.5 text-[9px] font-semibold text-slate-950"
                  >
                    install
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

function AutomationsTab({
  cfg,
  patch,
}: {
  cfg: SettingsConfig;
  patch: <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => void;
}) {
  const automations = cfg.automations;
  const setAutomation = (value: Partial<AutomationCfg>) =>
    patch("automations", { ...automations, ...value });

  return (
    <>
      <Section title="Rules">
        <Toggle
          label="Pre-meeting pause"
          hint="Notify two minutes before a calendar event and pause non-essential prompts."
          checked={automations.preMeetingPause}
          onChange={(value) => setAutomation({ preMeetingPause: value })}
        />
        <Toggle
          label="Automatic Do Not Disturb"
          hint="Focus while a meeting app is in the foreground."
          checked={automations.autoDnd}
          onChange={(value) => setAutomation({ autoDnd: value })}
        />
        <Toggle
          label="AI quota alerts"
          hint="Show an island alert at 85% and 95% of a provider window."
          checked={automations.aiQuotaAlerts}
          onChange={(value) => setAutomation({ aiQuotaAlerts: value })}
        />
        <Toggle
          label="Renewal reminders"
          hint="Remind you two days before a subscription renews."
          checked={automations.renewalReminders}
          onChange={(value) => setAutomation({ renewalReminders: value })}
        />
        <Toggle
          label="IntelliHide"
          hint="Hide the dock while a window covers its edge, show it when you reach for it."
          checked={automations.intelliHide}
          onChange={(value) => setAutomation({ intelliHide: value })}
        />
        <Toggle
          label="Low-battery power shift"
          hint="Switch Windows to the high-performance plan under 20% on battery."
          checked={automations.lowBatteryPowerShift}
          onChange={(value) => setAutomation({ lowBatteryPowerShift: value })}
        />
      </Section>

      <Section title="Context profiles" hint={cfg.activeProfile + " active"}>
        {cfg.profiles.map((profile) => (
          <div
            key={profile.name}
            className="rounded-xl border border-white/[0.07] bg-[#111827]/80 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[12px] font-medium text-slate-100">
                <span className="size-2.5 rounded-full" style={{ background: profile.color }} />
                {profile.name}
              </span>
              <button
                type="button"
                onClick={() => invoke("set_profile", { name: profile.name }).catch(() => {})}
                className="rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[10.5px] font-medium text-slate-200 transition hover:bg-white/[0.12]"
              >
                Activate
              </button>
            </div>
            <input
              value={profile.triggers.join(", ")}
              placeholder="process.exe, other.exe"
              onChange={(event) =>
                patch(
                  "profiles",
                  cfg.profiles.map((entry) =>
                    entry.name === profile.name
                      ? {
                          ...entry,
                          triggers: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        }
                      : entry,
                  ),
                )
              }
              className="mt-2 w-full rounded-lg border border-white/[0.08] bg-[#090d16] px-2.5 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-[var(--glacier-accent)]"
            />
          </div>
        ))}
        <p className="text-[9px] leading-snug opacity-40">
          The foreground process name is matched case-insensitively every 1.5 s. Profiles only change
          the widget set and accent; they never launch anything.
        </p>
      </Section>
    </>
  );
}

function TelemetryTab({
  cfg,
  patch,
  frame,
}: {
  cfg: SettingsConfig;
  patch: <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => void;
  frame: ReturnType<typeof useTelemetry>;
}) {
  const telemetry = cfg.telemetry;
  const setTelemetry = (value: Partial<TelemetryCfg>) =>
    patch("telemetry", { ...telemetry, ...value });

  return (
    <>
      <Section title="Local bus">
        <Toggle
          label="Publish telemetry to widgets"
          hint="A single sampler thread broadcasts CPU, memory, disk, network and battery frames."
          checked={telemetry.enabled}
          onChange={(value) => setTelemetry({ enabled: value })}
        />
        <Slider
          label="Sampling interval"
          value={telemetry.intervalMs}
          min={250}
          max={5000}
          step={250}
          suffix=" ms"
          onChange={(value) => setTelemetry({ intervalMs: value })}
        />
        <Toggle
          label="Include top process"
          hint="Adds one process scan per frame. Disable to shave a little CPU."
          checked={telemetry.topProcess}
          onChange={(value) => setTelemetry({ topProcess: value })}
        />
        <Toggle
          label="Include network counters"
          hint="Sums interface octets to compute throughput."
          checked={telemetry.network}
          onChange={(value) => setTelemetry({ network: value })}
        />
      </Section>

      <Section title="Live frame" hint={`sequence ${frame.seq}`}>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {[
            ["CPU", frame.cpuPercent.toFixed(1) + "%"],
            ["User / kernel", frame.cpuUserPercent.toFixed(0) + "% / " + frame.cpuKernelPercent.toFixed(0) + "%"],
            ["Memory", frame.ramUsedMb.toFixed(0) + " / " + frame.ramTotalMb.toFixed(0) + " MB"],
            ["Commit", frame.commitUsedMb.toFixed(0) + " MB"],
            ["Disk free", frame.diskFreeGb.toFixed(1) + " GB"],
            ["Down / up", (frame.netDownBps / 1024).toFixed(0) + " / " + (frame.netUpBps / 1024).toFixed(0) + " KB/s"],
            ["Battery", frame.batteryPercent === null ? "none" : frame.batteryPercent + "%"],
            ["Top process", frame.topProcess ? frame.topProcess.name : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wider opacity-40">{label}</div>
              <div className="truncate tabular-nums">{value}</div>
            </div>
          ))}
        </div>
        <p className="text-[9px] leading-snug opacity-40">
          GPU and temperature are reported as null rather than guessed: they need D3DKMT/ETW and WMI
          providers this build does not include.
        </p>
      </Section>
    </>
  );
}

function AdvancedTab({
  cfg,
  patch,
}: {
  cfg: SettingsConfig;
  patch: <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => void;
}) {
  const advanced = cfg.advanced;
  const setAdvanced = (value: Partial<AdvancedCfg>) => patch("advanced", { ...advanced, ...value });

  return (
    <>
      <Section title="Startup & updates">
        <Toggle
          label="Hardware acceleration"
          hint="Use the DXGI capture path for the liquid-glass refraction."
          checked={advanced.hardwareAcceleration}
          onChange={(value) => setAdvanced({ hardwareAcceleration: value })}
        />
        <Toggle
          label="Start with Windows"
          hint="Adds a Run entry, so Task Manager → Startup and Windows Settings → Apps → Startup can turn it on or off too."
          checked={advanced.startWithWindows}
          onChange={(value) => setAdvanced({ startWithWindows: value })}
        />
        <Toggle
          label="Check for updates"
          hint="Queries GitHub Releases over HTTPS at launch."
          checked={advanced.checkUpdates}
          onChange={(value) => setAdvanced({ checkUpdates: value })}
        />
        <Slider
          label="Flyout linger"
          value={advanced.flyoutLingerMs}
          min={0}
          max={2000}
          step={50}
          suffix=" ms"
          onChange={(value) => setAdvanced({ flyoutLingerMs: value })}
        />
      </Section>

      <Section title="Tools">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => glacier.system.taskManager().catch(() => {})}
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] hover:bg-white/20"
          >
            Activity monitor
          </button>
          <button
            type="button"
            onClick={() => glacier.system.spotlight().catch(() => {})}
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] hover:bg-white/20"
          >
            Spotlight
          </button>
          <button
            type="button"
            onClick={() => glacier.system.openPath("ms-settings:appsfeatures").catch(() => {})}
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] hover:bg-white/20"
          >
            Installed apps
          </button>
        </div>
      </Section>

      <Section title="Configuration">
        <TextBlock path="%APPDATA%\GlacierDock\dock-config.json" />
        <TextBlock path="%APPDATA%\GlacierDock\widgets\ (manifests + per-widget storage)" />
        <p className="text-[9px] leading-snug opacity-40">
          Deleting these files resets the dock to defaults on the next launch. The taskbar journal
          lives beside them and is used by the --restore-taskbar CLI.
        </p>
      </Section>
    </>
  );
}

function TextBlock({ path }: { path: string }) {
  return (
    <code className="block truncate rounded-md bg-black/30 px-2 py-1.5 font-mono text-[10px] opacity-70">
      {path}
    </code>
  );
}

function AboutTab() {
  return (
    <>
      <Section title="Glacier Dock" hint={glacier.version}>
        <p className="text-[11px] leading-relaxed opacity-70">
          A free, MIT-licensed Windows 11/10 dock with a liquid-glass refraction engine, a local
          activity monitor, context profiles and a widget catalog of {WIDGETS.length} widgets.
          No accounts, no analytics, no network calls unless you configure a feed.
        </p>
      </Section>

      <Section title="Widget catalog">
        <div className="grid grid-cols-3 gap-2">
          {CATEGORY_ORDER.map((key) => (
            <div key={key} className="rounded-lg bg-white/5 px-2 py-1.5">
              <div className="text-[10px]">{CATEGORY_META[key].label}</div>
              <div className="text-[9px] opacity-40">
                {WIDGETS.filter((widget) => widget.category === key).length} widgets
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Links">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() =>
              glacier.system
                .openPath("https://github.com/borhanrahi/Glacier-Dock")
                .catch(() => {})
            }
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] hover:bg-white/20"
          >
            GitHub repository
          </button>
          <button
            type="button"
            onClick={() => glacier.system.openPath("ms-settings:about").catch(() => {})}
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] hover:bg-white/20"
          >
            Windows about
          </button>
          <button
            type="button"
            onClick={() => invoke("restore_native_taskbar").catch(() => {})}
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] hover:bg-white/20"
          >
            Restore taskbar
          </button>
        </div>
        <p className="text-[9px] leading-snug opacity-40">
          Platform: {glacier.platform} · SDK {glacier.version} · MIT licence · built with Tauri 2,
          React 19 and the Windows crate.
        </p>
      </Section>
    </>
  );
}
