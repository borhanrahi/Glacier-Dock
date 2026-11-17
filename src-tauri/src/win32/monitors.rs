//! Multi-monitor dock lifecycle.
//!
//! Enumerates displays with `EnumDisplayMonitors`, creates one transparent Tauri
//! webview per display (`dock-0`, `dock-1`, …) sized to the pill plus magnify
//! headroom, and rebuilds the set on `WM_DISPLAYCHANGE` / `WM_SETTINGCHANGE`
//! (hot-plug, resolution and DPI changes).

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use windows::core::{w, BOOL};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
    SetWindowDisplayAffinity, SetWindowLongPtrW, TranslateMessage, GWLP_USERDATA, HWND_MESSAGE,
    MSG, WDA_EXCLUDEFROMCAPTURE, WINDOW_EX_STYLE, WINDOW_STYLE, WM_DISPLAYCHANGE,
    WM_SETTINGCHANGE, WNDCLASSW, WS_POPUP,
};

use crate::config::{self, DockSize, Edge};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub device: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
}

static MONITORS: Mutex<Vec<MonitorInfo>> = Mutex::new(Vec::new());
static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn cached_monitors() -> Vec<MonitorInfo> {
    MONITORS.lock().map(|m| m.clone()).unwrap_or_default()
}

pub fn enumerate() -> Vec<MonitorInfo> {
    let mut found: Vec<MonitorInfo> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(enum_proc),
            LPARAM(&mut found as *mut Vec<MonitorInfo> as isize),
        );
    }
    if let Ok(mut cache) = MONITORS.lock() {
        *cache = found.clone();
    }
    found
}

unsafe extern "system" fn enum_proc(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _clip: *mut RECT,
    data: LPARAM,
) -> BOOL {
    let out = &mut *(data.0 as *mut Vec<MonitorInfo>);
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut _).as_bool() {
        let device = String::from_utf16_lossy(&info.szDevice)
            .trim_end_matches('\0')
            .to_string();
        let rc = info.monitorInfo.rcMonitor;
        out.push(MonitorInfo {
            device,
            x: rc.left,
            y: rc.top,
            width: rc.right - rc.left,
            height: rc.bottom - rc.top,
            primary: info.monitorInfo.dwFlags & 1 != 0, // MONITORINFOF_PRIMARY
        });
    }
    BOOL(1)
}

pub fn monitor_for_point(x: i32, y: i32) -> Option<MonitorInfo> {
    cached_monitors().into_iter().find(|m| {
        x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height
    })
}

/// The dock window rect on a monitor edge: the bar plus transparent headroom
/// for the 1.35x magnified icons.
pub fn dock_window_rect(monitor: &MonitorInfo, edge: Edge, size: DockSize) -> (i32, i32, i32, i32) {
    let (_, bar) = size.metrics();
    let extent = (bar + config::headroom(size)).round() as i32;
    match edge {
        Edge::Bottom => (
            monitor.x,
            monitor.y + monitor.height - extent,
            monitor.width,
            extent,
        ),
        Edge::Top => (monitor.x, monitor.y, monitor.width, extent),
        Edge::Left => (monitor.x, monitor.y, extent, monitor.height),
        Edge::Right => (
            monitor.x + monitor.width - extent,
            monitor.y,
            extent,
            monitor.height,
        ),
    }
}

/// Create or reposition one dock window per connected display.
pub fn sync_docks(app: &AppHandle) {
    let monitors = enumerate();
    if monitors.is_empty() {
        return;
    }

    let mut cfg = config::load(app);
    let mut wanted: Vec<(String, MonitorInfo, (i32, i32, i32, i32))> = Vec::new();

    for (index, monitor) in monitors.iter().enumerate() {
        let label = format!("dock-{index}");
        let dock = config::dock_for_monitor(&mut cfg, &monitor.device);
        let rect = dock_window_rect(monitor, dock.edge, dock.size);
        wanted.push((label, monitor.clone(), rect));
    }

    // Close docks for displays that went away.
    for (label, window) in app.webview_windows() {
        if label.starts_with("dock-") && !wanted.iter().any(|(l, _, _)| *l == label) {
            let _ = window.close();
        }
    }

    for (label, _monitor, (x, y, width, height)) in wanted {
        match app.get_webview_window(&label) {
            Some(window) => {
                let _ = window.set_position(PhysicalPosition::new(x, y));
                let _ = window.set_size(PhysicalSize::new(width as u32, height as u32));
            }
            None => {
                let url = WebviewUrl::App(PathBuf::from(format!("index.html?dock={label}")));
                match WebviewWindowBuilder::new(app, &label, url)
                    .title("Glacier Dock")
                    .transparent(true)
                    .decorations(false)
                    .shadow(false)
                    .resizable(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .focused(false)
                    .visible(true)
                    .build()
                {
                    Ok(window) => {
                        let _ = window.set_position(PhysicalPosition::new(x, y));
                        let _ = window.set_size(PhysicalSize::new(width as u32, height as u32));
                        if let Ok(hwnd) = window.hwnd() {
                            crate::win32::hit_test::install(hwnd.0 as isize);
                            unsafe {
                                let _ = SetWindowDisplayAffinity(
                                    HWND(hwnd.0),
                                    WDA_EXCLUDEFROMCAPTURE,
                                );
                            }
                        }
                    }
                    Err(err) => eprintln!("glacier: failed to create {label}: {err}"),
                }
            }
        }
    }

    config::save(app, &cfg);
}

/// Message-only window that rebuilds docks on display topology changes.
pub fn spawn_display_watcher(app: AppHandle) {
    let _ = APP.set(app.clone());
    std::thread::spawn(move || unsafe {
        let instance = match windows::Win32::System::LibraryLoader::GetModuleHandleW(None) {
            Ok(h) => h,
            Err(_) => return,
        };
        let class = w!("GlacierDockDisplayWatcher");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(watch_proc),
            hInstance: HINSTANCE(instance.0),
            lpszClassName: class,
            ..Default::default()
        };
        RegisterClassW(&wc);

        let hwnd = match CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class,
            w!(""),
            WINDOW_STYLE(WS_POPUP.0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(HINSTANCE(instance.0)),
            None,
        ) {
            Ok(h) => h,
            Err(_) => return,
        };
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, 1);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

unsafe extern "system" fn watch_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_DISPLAYCHANGE {
        if let Some(app) = APP.get() {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || sync_docks(&handle));
        }
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}
