//! Persisted dock configuration: per-display dock instances, appearance
//! tokens, solar schedule and chameleon settings.
//!
//! Stored as JSON next to the taskbar journal in the app config directory so a
//! crash never loses the layout.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const CONFIG_FILE: &str = "dock-config.json";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    #[default]
    Bottom,
    Top,
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    #[default]
    Floating,
    Attached,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidthMode {
    #[default]
    FitContent,
    #[serde(rename = "full")]
    FullWidth,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockSize {
    Small,
    #[default]
    Medium,
    Large,
}

impl DockSize {
    /// (base icon DIPs, pill height DIPs) from the design spec.
    pub fn metrics(self) -> (f64, f64) {
        match self {
            DockSize::Small => (36.0, 44.0),
            DockSize::Medium => (42.0, 52.0),
            DockSize::Large => (48.0, 60.0),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackdropMode {
    #[default]
    LiquidGlass,
    Blur,
    Acrylic,
    Solid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    /// liquid-glass | ios-glass | midnight | black | white
    pub preset: String,
    pub backdrop: BackdropMode,
    /// 0..=1, drives `--glacier-tint-alpha`
    pub tint_alpha: f32,
    pub accent: String,
    pub solar_auto: bool,
    pub solar_day_preset: String,
    pub solar_night_preset: String,
    pub chameleon_tint: bool,
    /// 0 = magnification off, otherwise 1.28..=1.40
    pub magnification: f32,
    pub size: DockSize,
    pub shape: Shape,
    pub edge_margin: f64,
    pub width_mode: WidthMode,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            preset: "liquid-glass".into(),
            backdrop: BackdropMode::LiquidGlass,
            tint_alpha: 0.58,
            accent: "#38BDF8".into(),
            solar_auto: false,
            solar_day_preset: "white".into(),
            solar_night_preset: "midnight".into(),
            chameleon_tint: true,
            magnification: 1.32,
            size: DockSize::Medium,
            shape: Shape::Floating,
            edge_margin: 10.0,
            width_mode: WidthMode::FitContent,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DockInstance {
    /// Device name from `EnumDisplayMonitors` (e.g. `\\.\DISPLAY1`).
    pub monitor: String,
    pub edge: Edge,
    pub shape: Shape,
    pub width_mode: WidthMode,
    pub size: DockSize,
    pub widgets: Vec<String>,
}

impl Default for DockInstance {
    fn default() -> Self {
        Self {
            monitor: String::new(),
            edge: Edge::Bottom,
            shape: Shape::Floating,
            width_mode: WidthMode::FitContent,
            size: DockSize::Medium,
            widgets: vec!["apps-dock-zone".into(), "clock-large".into()],
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ContextProfile {
    pub name: String,
    /// Executable names (case-insensitive) that activate this profile.
    pub triggers: Vec<String>,
    pub widgets: Vec<String>,
    pub color: String,
}

impl Default for ContextProfile {
    fn default() -> Self {
        Self {
            name: "Default".into(),
            triggers: Vec::new(),
            widgets: vec!["apps-dock-zone".into(), "clock-large".into()],
            color: "#38BDF8".into(),
        }
    }
}

pub fn default_profiles() -> Vec<ContextProfile> {
    vec![
        ContextProfile::default(),
        ContextProfile {
            name: "Work".into(),
            triggers: vec![
                "winword.exe".into(),
                "excel.exe".into(),
                "powerpnt.exe".into(),
                "teams.exe".into(),
                "outlook.exe".into(),
                "notion.exe".into(),
            ],
            widgets: vec![
                "apps-dock-zone".into(),
                "unified-calendar".into(),
                "todo-ring".into(),
                "clock-large".into(),
            ],
            color: "#34D399".into(),
        },
        ContextProfile {
            name: "Coding".into(),
            triggers: vec![
                "code.exe".into(),
                "devenv.exe".into(),
                "windowsterminal.exe".into(),
                "idea64.exe".into(),
                "pycharm64.exe".into(),
                "cursor.exe".into(),
            ],
            widgets: vec![
                "apps-dock-zone".into(),
                "github-activity".into(),
                "port-killer".into(),
                "ai-limits-dual".into(),
                "clock-large".into(),
            ],
            color: "#A78BFA".into(),
        },
        ContextProfile {
            name: "Gaming".into(),
            triggers: vec![
                "valorant.exe".into(),
                "cyberpunk2077.exe".into(),
                "cs2.exe".into(),
                "obs64.exe".into(),
                "steam.exe".into(),
            ],
            widgets: vec![
                "apps-dock-zone".into(),
                "gpu-monitor".into(),
                "temperature-gauge".into(),
                "mic-mute-combo".into(),
            ],
            color: "#FB923C".into(),
        },
    ]
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AutomationSettings {
    pub pre_meeting_pause: bool,
    pub auto_dnd: bool,
    pub ai_quota_alerts: bool,
    pub renewal_reminders: bool,
    pub intelli_hide: bool,
    pub low_battery_power_shift: bool,
}

impl Default for AutomationSettings {
    fn default() -> Self {
        Self {
            pre_meeting_pause: true,
            auto_dnd: true,
            ai_quota_alerts: true,
            renewal_reminders: true,
            intelli_hide: true,
            low_battery_power_shift: false,
        }
    }
}

/// Local telemetry bus: what the sampler publishes to widgets.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TelemetrySettings {
    pub enabled: bool,
    /// Sampling interval for the 1 Hz default; clamped to 250..=10000 ms.
    pub interval_ms: u32,
    pub top_process: bool,
    pub network: bool,
}

impl Default for TelemetrySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_ms: 1_000,
            top_process: true,
            network: true,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AdvancedSettings {
    pub hardware_acceleration: bool,
    pub start_with_windows: bool,
    pub check_updates: bool,
    /// Community widget index endpoint (empty = bundled catalog only).
    pub store_url: String,
    /// Seconds the flyout stays open after the pointer leaves.
    pub flyout_linger_ms: u32,
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self {
            hardware_acceleration: true,
            start_with_windows: false,
            check_updates: true,
            store_url: String::new(),
            flyout_linger_ms: 450,
        }
    }
}

/// One app the user chose to keep on the dock.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedApp {
    pub name: String,
    /// Shortcut path, `.exe`, or a `ms-settings:`-style URI.
    pub path: String,
}

/// First-run dock contents. Deliberately tiny and predictable: the dock is
/// never auto-filled with whatever happens to sit in the Start Menu.
pub fn default_pinned_apps() -> Vec<PinnedApp> {
    let explorer = std::env::var("SystemRoot")
        .map(|root| format!(r"{root}\explorer.exe"))
        .unwrap_or_else(|_| r"C:\Windows\explorer.exe".into());

    vec![
        PinnedApp {
            name: "File Explorer".into(),
            path: explorer,
        },
        PinnedApp {
            name: "Settings".into(),
            path: "ms-settings:".into(),
        },
    ]
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    pub replace_taskbar: bool,
    pub appearance: Appearance,
    pub docks: Vec<DockInstance>,
    pub profiles: Vec<ContextProfile>,
    pub active_profile: String,
    pub automations: AutomationSettings,
    pub telemetry: TelemetrySettings,
    pub advanced: AdvancedSettings,
    /// Apps pinned to every dock, in order.
    pub pinned_apps: Vec<PinnedApp>,
    /// Becomes true once the first-run pins have been written, so clearing the
    /// dock later stays cleared instead of re-seeding the defaults.
    pub pins_initialized: bool,
    /// Widget ids pinned to every dock's strip (click → flyout).
    pub dock_widgets: Vec<String>,
    /// Latitude/longitude for the solar auto day/night schedule.
    pub latitude: f64,
    pub longitude: f64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            // Off by default: hiding the user's taskbar is opt-in, never a
            // surprise after install.
            replace_taskbar: false,
            appearance: Appearance::default(),
            docks: Vec::new(),
            profiles: default_profiles(),
            active_profile: "Default".into(),
            automations: AutomationSettings::default(),
            telemetry: TelemetrySettings::default(),
            advanced: AdvancedSettings::default(),
            pinned_apps: default_pinned_apps(),
            pins_initialized: false,
            dock_widgets: vec!["cpu-monitor".into(), "clock-large".into(), "battery-status".into()],
            latitude: 0.0,
            longitude: 0.0,
        }
    }
}

/// `%APPDATA%\GlacierDock` — shared by the taskbar journal, widget store and
/// config so the `--restore-taskbar` CLI can find it without a Tauri app.
pub fn data_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("GlacierDock");
    }
    std::env::temp_dir().join("GlacierDock")
}

pub fn config_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok()
}

pub fn config_path(app: &AppHandle) -> Option<PathBuf> {
    config_dir(app).map(|dir| dir.join(CONFIG_FILE))
}

pub fn load(app: &AppHandle) -> AppConfig {
    let Some(path) = config_path(app) else {
        return AppConfig::default();
    };
    let mut cfg: AppConfig = match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    };

    // First launch (or an upgrade from a build without pins): write the
    // defaults once so the dock has something sane to show and so emptying the
    // dock later is respected.
    if !cfg.pins_initialized {
        if cfg.pinned_apps.is_empty() {
            cfg.pinned_apps = default_pinned_apps();
        }
        cfg.pins_initialized = true;
        save(app, &cfg);
    }

    cfg
}

pub fn save(app: &AppHandle, cfg: &AppConfig) {
    let Some(dir) = config_dir(app) else { return };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(text) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(dir.join(CONFIG_FILE), text);
    }
}

/// Dock instance for a monitor, inserting the default when absent.
pub fn dock_for_monitor(cfg: &mut AppConfig, monitor: &str) -> DockInstance {
    if let Some(existing) = cfg.docks.iter().find(|d| d.monitor == monitor) {
        return existing.clone();
    }
    let dock = DockInstance {
        monitor: monitor.to_string(),
        ..DockInstance::default()
    };
    cfg.docks.push(dock.clone());
    dock
}

/// Transparent headroom above/beside the pill so magnified icons never resize
/// the OS window. Sized to the max 1.35x icon plus shadow padding.
pub fn headroom(size: DockSize) -> f64 {
    let (_, bar) = size.metrics();
    (bar * 1.35 - bar) + 44.0
}
