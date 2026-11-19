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
    /// (base icon DIPs, pill height DIPs) matched to the Windows 11 taskbar.
    pub fn metrics(self) -> (f64, f64) {
        match self {
            DockSize::Small => (32.0, 40.0),
            DockSize::Medium => (38.0, 48.0),
            DockSize::Large => (44.0, 56.0),
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
    /// liquid-glass | ios-glass | midnight | black | white | prism
    pub preset: String,
    #[serde(default = "default_icon_plate")]
    pub icon_plate: String,
    pub backdrop: BackdropMode,
    /// 0..=1, drives `--glacier-tint-alpha`
    pub tint_alpha: f32,
    pub accent: String,
    pub solar_auto: bool,
    pub solar_day_preset: String,
    pub solar_night_preset: String,
    pub chameleon_tint: bool,
    /// 0 = magnification off, otherwise 1.15..=2.00
    pub magnification: f32,
    pub size: DockSize,
    pub shape: Shape,
    pub edge_margin: f64,
    pub width_mode: WidthMode,
}

fn default_icon_plate() -> String {
    "none".into()
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            preset: "liquid-glass".into(),
            icon_plate: default_icon_plate(),
            backdrop: BackdropMode::LiquidGlass,
            tint_alpha: 0.58,
            accent: "#38BDF8".into(),
            solar_auto: false,
            solar_day_preset: "white".into(),
            solar_night_preset: "midnight".into(),
            chameleon_tint: true,
            magnification: 1.8,
            size: DockSize::Medium,
            shape: Shape::Floating,
            edge_margin: 4.0,
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
            intelli_hide: false,
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

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    /// Bumped when a stored config needs fixing up on load.
    pub config_version: u32,
    pub replace_taskbar: bool,
    #[serde(default = "default_true")]
    pub show_telemetry_rings: bool,
    #[serde(default = "default_true")]
    pub show_ai_usage: bool,
    #[serde(default = "default_true")]
    pub show_quick_folders: bool,
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
            config_version: 2,
            replace_taskbar: true,
            show_telemetry_rings: true,
            show_ai_usage: true,
            show_quick_folders: true,
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

    let mut migrated = false;

    // Builds before 0.2.x hid the taskbar by default and left it on in saved
    // configs. Turn it back on once so an upgrade returns the user's taskbar.
    if cfg.config_version < 1 {
        cfg.replace_taskbar = false;
        cfg.config_version = 1;
        migrated = true;
    }

    if cfg.config_version < 2 {
        if cfg.appearance.magnification > 0.0 && cfg.appearance.magnification <= 1.41 {
            cfg.appearance.magnification = 1.8;
        }
        cfg.config_version = 2;
        migrated = true;
    }

    if cfg.config_version < 3 {
        if (cfg.appearance.edge_margin - 10.0).abs() < 0.5 {
            cfg.appearance.edge_margin = 4.0;
        }
        cfg.config_version = 3;
        migrated = true;
    }

    // First launch (or an upgrade from a build without pins): write the
    // defaults once so the dock has something sane to show and so emptying the
    // dock later is respected.
    if !cfg.pins_initialized {
        if cfg.pinned_apps.is_empty() {
            cfg.pinned_apps = default_pinned_apps();
        }
        cfg.pins_initialized = true;
        migrated = true;
    }

    if migrated {
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

/// Transparent headroom above/beside the pill so magnified icons, tooltips,
/// and popovers never clip inside the OS window.
pub fn headroom(size: DockSize) -> f64 {
    let (_, bar) = size.metrics();
    (bar * 0.9) + 148.0
}
