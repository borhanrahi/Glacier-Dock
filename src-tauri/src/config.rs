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
pub struct AppConfig {
    pub replace_taskbar: bool,
    pub appearance: Appearance,
    pub docks: Vec<DockInstance>,
    /// Latitude/longitude for the solar auto day/night schedule.
    pub latitude: f64,
    pub longitude: f64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            replace_taskbar: true,
            appearance: Appearance::default(),
            docks: Vec::new(),
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
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
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
