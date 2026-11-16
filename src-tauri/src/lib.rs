//! Glacier Dock — application entry, IPC surface and lifecycle.
//!
//! Milestone 1 responsibilities:
//!   * hide/replace the Windows taskbar safely (journal + restore paths),
//!   * build one dock window per display and rebuild on hot-plug,
//!   * drive the DXGI liquid glass capture loop,
//!   * expose layout, pill-rect and accent IPC to the webview.

mod config;
#[cfg(windows)]
mod win32;

use serde::Serialize;
use tauri::{
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use config::{AppConfig, DockSize};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockLayout {
    pub label: String,
    pub monitor: String,
    pub edge: config::Edge,
    pub shape: config::Shape,
    pub width_mode: config::WidthMode,
    pub icon_size: f64,
    pub bar_height: f64,
    pub headroom: f64,
    pub accent: Option<String>,
    pub high_contrast: bool,
}

impl Default for DockLayout {
    fn default() -> Self {
        let (icon, bar) = DockSize::Medium.metrics();
        Self {
            label: "dock".into(),
            monitor: String::new(),
            edge: config::Edge::Bottom,
            shape: config::Shape::Floating,
            width_mode: config::WidthMode::FitContent,
            icon_size: icon,
            bar_height: bar,
            headroom: config::headroom(DockSize::Medium),
            accent: None,
            high_contrast: false,
        }
    }
}

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    config::load(&app)
}

#[tauri::command]
fn save_config(app: AppHandle, cfg: AppConfig) {
    config::save(&app, &cfg);
    #[cfg(windows)]
    win32::monitors::sync_docks(&app);
}

/// Layout for the dock that owns this window (edge, size metrics, accent).
#[tauri::command]
fn dock_layout(app: AppHandle, window: WebviewWindow) -> DockLayout {
    let mut layout = DockLayout {
        label: window.label().to_string(),
        ..DockLayout::default()
    };

    #[cfg(windows)]
    {
        if let Ok(pos) = window.outer_position() {
            let monitor = win32::monitors::monitor_for_point(pos.x + 8, pos.y + 8)
                .or_else(|| win32::monitors::cached_monitors().into_iter().next());
            if let Some(monitor) = monitor {
                layout.monitor = monitor.device.clone();
                let mut cfg = config::load(&app);
                let dock = config::dock_for_monitor(&mut cfg, &monitor.device);
                let (icon, bar) = dock.size.metrics();
                layout.edge = dock.edge;
                layout.shape = dock.shape;
                layout.width_mode = dock.width_mode;
                layout.icon_size = icon;
                layout.bar_height = bar;
                layout.headroom = config::headroom(dock.size);
            }
        }
        layout.accent = win32::wallpaper::accent_color();
        layout.high_contrast = win32::wallpaper::high_contrast_enabled();
    }

    layout
}

/// Frontend reports the pill's client rect in CSS pixels. Used for the
/// WM_NCHITTEST headroom and for scoping the DXGI capture region.
#[tauri::command]
fn set_pill_rect(window: WebviewWindow, x: f64, y: f64, width: f64, height: f64) {
    #[cfg(windows)]
    {
        let Ok(hwnd) = window.hwnd() else { return };
        let scale = window.scale_factor().unwrap_or(1.0);
        let px = (x * scale).round() as i32;
        let py = (y * scale).round() as i32;
        let pw = (width * scale).round().max(1.0) as u32;
        let ph = (height * scale).round().max(1.0) as u32;

        win32::hit_test::set_rect(hwnd.0 as isize, px, py, pw as i32, ph as i32);

        if let Ok(pos) = window.outer_position() {
            win32::liquid_glass::set_target(window.label(), pos.x + px, pos.y + py, pw, ph);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (window, x, y, width, height);
    }
}

/// Raw RGBA frame, prefixed with `u32` width and height so pixels never go
/// through JSON. Returns an empty buffer when nothing changed.
#[tauri::command]
fn glass_frame(window: WebviewWindow, since: u64) -> tauri::ipc::Response {
    #[cfg(windows)]
    {
        if let Some(frame) = win32::liquid_glass::latest_frame(window.label(), since) {
            let mut out = Vec::with_capacity(8 + frame.rgba.len());
            out.extend_from_slice(&frame.width.to_le_bytes());
            out.extend_from_slice(&frame.height.to_le_bytes());
            out.extend_from_slice(&frame.rgba);
            return tauri::ipc::Response::new(out);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (window, since);
    }
    tauri::ipc::Response::new(Vec::new())
}

#[tauri::command]
fn wallpaper_accent() -> Option<String> {
    #[cfg(windows)]
    {
        win32::wallpaper::accent_color()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[tauri::command]
fn installed_apps(limit: Option<usize>) -> Vec<serde_json::Value> {
    #[cfg(windows)]
    {
        return win32::apps::installed_apps(limit.unwrap_or(400))
            .into_iter()
            .map(|app| serde_json::to_value(app).unwrap_or_default())
            .collect();
    }
    #[cfg(not(windows))]
    {
        let _ = limit;
        Vec::new()
    }
}

#[tauri::command]
fn launch_app(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        return win32::apps::launch(&path);
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("launching apps is only supported on Windows".into())
    }
}

/// Persist the dock edge for a monitor (drag-to-edge snapping).
#[tauri::command]
fn set_dock_edge(app: AppHandle, monitor: String, edge: config::Edge) {
    let mut cfg = config::load(&app);
    let _ = config::dock_for_monitor(&mut cfg, &monitor);
    if let Some(dock) = cfg.docks.iter_mut().find(|dock| dock.monitor == monitor) {
        dock.edge = edge;
    }
    config::save(&app, &cfg);
    #[cfg(windows)]
    win32::monitors::sync_docks(&app);
}

/// Drag-to-edge snapping: the webview reports where the drag ended, Rust picks
/// the closest monitor edge and repositions every dock.
#[tauri::command]
fn snap_dock_edge(app: AppHandle, window: WebviewWindow, x: f64, y: f64) {
    #[cfg(windows)]
    {
        let scale = window.scale_factor().unwrap_or(1.0);
        let Ok(position) = window.outer_position() else {
            return;
        };
        let screen_x = position.x + (x * scale).round() as i32;
        let screen_y = position.y + (y * scale).round() as i32;

        let monitor = win32::monitors::monitor_for_point(screen_x, screen_y)
            .or_else(|| win32::monitors::cached_monitors().into_iter().next());
        let Some(monitor) = monitor else { return };

        let candidates = [
            (config::Edge::Left, (screen_x - monitor.x).abs()),
            (
                config::Edge::Right,
                (screen_x - (monitor.x + monitor.width)).abs(),
            ),
            (config::Edge::Top, (screen_y - monitor.y).abs()),
            (
                config::Edge::Bottom,
                (screen_y - (monitor.y + monitor.height)).abs(),
            ),
        ];
        let edge = candidates
            .iter()
            .min_by_key(|(_, distance)| *distance)
            .map(|(edge, _)| *edge)
            .unwrap_or(config::Edge::Bottom);

        let mut cfg = config::load(&app);
        let _ = config::dock_for_monitor(&mut cfg, &monitor.device);
        if let Some(dock) = cfg.docks.iter_mut().find(|dock| dock.monitor == monitor.device) {
            dock.edge = edge;
        }
        config::save(&app, &cfg);
        win32::monitors::sync_docks(&app);
    }
    #[cfg(not(windows))]
    {
        let _ = (app, window, x, y);
    }
}

#[tauri::command]
fn open_spotlight(app: AppHandle) {
    let _ = ensure_window(&app, "spotlight", "Glacier Spotlight", 760.0, 480.0);
}

#[tauri::command]
fn open_launcher(app: AppHandle) {
    let _ = ensure_window(&app, "launcher", "Glacier Launchpad", 880.0, 600.0);
}

#[tauri::command]
fn hide_window(window: WebviewWindow) {
    let _ = window.hide();
}

pub fn open_task_manager(app: &AppHandle) -> Option<WebviewWindow> {
    ensure_window(app, "task-manager", "Glacier Activity Monitor", 900.0, 600.0)
}

#[tauri::command]
fn task_manager(app: AppHandle) {
    let _ = open_task_manager(&app);
}

#[tauri::command]
fn process_snapshot() -> serde_json::Value {
    #[cfg(windows)]
    {
        return serde_json::to_value(win32::process_manager::snapshot()).unwrap_or_default();
    }
    #[cfg(not(windows))]
    {
        serde_json::json!({ "processes": [], "totalRam": 0, "usedRam": 0 })
    }
}

#[tauri::command]
fn kill_process(pid: u32, tree: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        return win32::process_manager::kill(pid, tree);
    }
    #[cfg(not(windows))]
    {
        let _ = (pid, tree);
        Err("only supported on Windows".into())
    }
}

#[tauri::command]
fn suspend_process(pid: u32, suspend: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        return win32::process_manager::set_suspended(pid, suspend);
    }
    #[cfg(not(windows))]
    {
        let _ = (pid, suspend);
        Err("only supported on Windows".into())
    }
}

#[tauri::command]
fn reveal_process(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        return win32::process_manager::reveal(pid);
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        Err("only supported on Windows".into())
    }
}

#[tauri::command]
fn listening_ports() -> serde_json::Value {
    #[cfg(windows)]
    {
        return serde_json::to_value(win32::process_manager::listening_ports()).unwrap_or_default();
    }
    #[cfg(not(windows))]
    {
        serde_json::json!([])
    }
}

#[tauri::command]
fn startup_entries() -> serde_json::Value {
    #[cfg(windows)]
    {
        return serde_json::to_value(win32::process_manager::startup_entries()).unwrap_or_default();
    }
    #[cfg(not(windows))]
    {
        serde_json::json!([])
    }
}

#[tauri::command]
fn jump_destinations(limit: Option<usize>) -> serde_json::Value {
    #[cfg(windows)]
    {
        return serde_json::to_value(win32::jumplist::recent_destinations(
            limit.unwrap_or(8),
        ))
        .unwrap_or_default();
    }
    #[cfg(not(windows))]
    {
        let _ = limit;
        serde_json::json!([])
    }
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        return win32::apps::launch(&path);
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("only supported on Windows".into())
    }
}

#[tauri::command]
fn set_profile(app: AppHandle, name: String) {
    let mut cfg = config::load(&app);
    cfg.active_profile = name.clone();
    config::save(&app, &cfg);
    if let Some(profile) = cfg.profiles.iter().find(|profile| profile.name == name) {
        use tauri::Emitter;
        let _ = app.emit("glacier://profile", profile);
    }
}

/// Calendar widget hook: an event is <= 2 minutes away.
#[tauri::command]
fn automation_meeting(app: AppHandle, title: String) {
    #[cfg(windows)]
    win32::automations::on_meeting_started(&app, &title);
    let _ = &app;
}

/// AI quota widget hook: a provider crossed 85% / 95% of its window.
#[tauri::command]
fn automation_quota(app: AppHandle, vendor: String, percent: f32, resets_at: String) {
    #[cfg(windows)]
    win32::automations::on_ai_quota(&app, &vendor, percent, &resets_at);
    let _ = &app;
}

#[tauri::command]
fn preview_windows(pid: u32) -> serde_json::Value {
    #[cfg(windows)]
    {
        return serde_json::to_value(win32::dwm_preview::windows_for_pid(pid)).unwrap_or_default();
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        serde_json::json!([])
    }
}

/// Show a live DWM thumbnail of the first visible window owned by `pid`.
#[tauri::command]
fn show_app_preview(app: AppHandle, pid: u32) {
    #[cfg(windows)]
    {
        let Some(window) = ensure_window(&app, "preview", "Preview", 280.0, 180.0) else {
            return;
        };
        let Ok(preview_hwnd) = window.hwnd() else {
            return;
        };
        let windows = win32::dwm_preview::windows_for_pid(pid);
        let Some(target) = windows.first() else {
            let _ = window.hide();
            return;
        };
        if let Err(err) =
            win32::dwm_preview::attach(preview_hwnd.0 as isize, target.hwnd, 280, 180)
        {
            eprintln!("glacier: preview failed: {err}");
            let _ = window.hide();
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, pid);
    }
}

/// Hover preview: find the process by image name and thumbnail its window.
#[tauri::command]
fn show_preview_for_image(app: AppHandle, image: String) {
    #[cfg(windows)]
    {
        let snapshot = win32::process_manager::snapshot();
        if let Some(row) = snapshot
            .processes
            .iter()
            .find(|row| row.name.eq_ignore_ascii_case(&image))
        {
            let pid = row.pid;
            show_app_preview(app, pid);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, image);
    }
}

#[tauri::command]
fn hide_app_preview(app: AppHandle) {
    let Some(window) = app.get_webview_window("preview") else {
        return;
    };
    #[cfg(windows)]
    {
        if let Ok(hwnd) = window.hwnd() {
            win32::dwm_preview::detach(hwnd.0 as isize);
        }
    }
    let _ = window.hide();
}

/// Create (or re-show) a utility window: spotlight, launcher, flyout.
fn ensure_window(
    app: &AppHandle,
    label: &str,
    title: &str,
    width: f64,
    height: f64,
) -> Option<WebviewWindow> {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Some(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::App(std::path::PathBuf::from(format!("index.html?win={label}"))),
    )
    .title(title)
    .inner_size(width, height)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false)
    .build()
    .ok()?;

    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    Some(window)
}

/// `Alt + Space`: hide when open, otherwise summon Spotlight.
pub fn toggle_spotlight(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("spotlight") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = ensure_window(app, "spotlight", "Glacier Spotlight", 760.0, 480.0);
}

#[tauri::command]
fn restore_native_taskbar() {
    #[cfg(windows)]
    win32::taskbar::restore();
}

#[tauri::command]
fn monitors() -> Vec<serde_json::Value> {
    #[cfg(windows)]
    {
        win32::monitors::enumerate()
            .into_iter()
            .map(|m| serde_json::to_value(m).unwrap_or_default())
            .collect()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Restore the taskbar (normal exit and panic hook path).
pub fn restore_taskbar() {
    #[cfg(windows)]
    win32::taskbar::restore();
}

/// `--restore-taskbar` entry point, usable without a Tauri app running.
pub fn restore_taskbar_cli() {
    #[cfg(windows)]
    win32::taskbar::restore_from_journal();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            dock_layout,
            set_pill_rect,
            glass_frame,
            wallpaper_accent,
            restore_native_taskbar,
            monitors,
            installed_apps,
            launch_app,
            set_dock_edge,
            snap_dock_edge,
            open_spotlight,
            open_launcher,
            hide_window,
            task_manager,
            process_snapshot,
            kill_process,
            suspend_process,
            reveal_process,
            listening_ports,
            startup_entries,
            jump_destinations,
            open_path,
            set_profile,
            preview_windows,
            show_app_preview,
            show_preview_for_image,
            hide_app_preview,
            automation_meeting,
            automation_quota
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let cfg = config::load(&handle);

            #[cfg(windows)]
            {
                if cfg.replace_taskbar {
                    if let Err(err) = win32::taskbar::hide() {
                        eprintln!("glacier: could not hide the native taskbar: {err}");
                    }
                    win32::taskbar::spawn_watchdog();
                }
                win32::monitors::spawn_display_watcher(handle.clone());
                win32::monitors::sync_docks(&handle);
                win32::liquid_glass::start(handle.clone());
                win32::hotkey::spawn(handle.clone());
                win32::profiles::spawn(handle.clone());
                win32::automations::spawn(handle.clone());
                win32::systray::install(&handle);
            }

            // Non-Windows builds (CI, future ports) still need a window. On
            // Windows the docks above replace the static config window.
            #[cfg(not(windows))]
            {
                let _ = &cfg;
                let _ = tauri::WebviewWindowBuilder::new(
                    &handle,
                    "dock",
                    tauri::WebviewUrl::App("index.html?dock=dock".into()),
                )
                .title("Glacier Dock")
                .transparent(true)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .inner_size(900.0, 120.0)
                .build();
            }

            let _ = handle;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Glacier Dock")
        .run(|_app, event| {
            if let RunEvent::Exit = event {
                restore_taskbar();
            }
        });
}
