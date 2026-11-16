//! Local Smart Automations.
//!
//! Everything runs on-device from a single settings toggle block. Implemented
//! here: IntelliHide (step the dock aside for fullscreen games/video) and the
//! low-battery power saver shift. Meeting / AI-quota / renewal rules are
//! dispatched through `notify` so their widgets can call in as they land.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::RECT;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, IsWindowVisible,
};

use crate::config;

static LOW_BATTERY_SHIFTED: AtomicBool = AtomicBool::new(false);
static LOW_BATTERY_NOTIFIED: AtomicBool = AtomicBool::new(false);

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut hidden = false;
        loop {
            std::thread::sleep(Duration::from_millis(2000));
            let cfg = config::load(&app);

            if cfg.automations.intelli_hide {
                let fullscreen = foreground_is_fullscreen();
                if fullscreen && !hidden {
                    set_docks_visible(&app, false);
                    hidden = true;
                } else if !fullscreen && hidden {
                    set_docks_visible(&app, true);
                    hidden = false;
                }
            } else if hidden {
                set_docks_visible(&app, true);
                hidden = false;
            }

            if cfg.automations.low_battery_power_shift {
                check_battery(&app);
            }
        }
    });
}

fn set_docks_visible(app: &AppHandle, visible: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        for (label, window) in handle.webview_windows() {
            if !label.starts_with("dock-") {
                continue;
            }
            let _ = if visible { window.show() } else { window.hide() };
        }
    });
}

fn foreground_is_fullscreen() -> bool {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }
        // Compare against the monitor containing the window.
        let cx = rect.left + (rect.right - rect.left) / 2;
        let cy = rect.top + (rect.bottom - rect.top) / 2;
        let Some(monitor) = super::monitors::monitor_for_point(cx, cy) else {
            return false;
        };
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        width >= monitor.width - 2 && height >= monitor.height - 2
    }
}

fn check_battery(app: &AppHandle) {
    unsafe {
        let mut status = SYSTEM_POWER_STATUS::default();
        if GetSystemPowerStatus(&mut status).is_err() {
            return;
        }
        let on_ac = status.ACLineStatus == 1;
        let percent = status.BatteryLifePercent;

        if on_ac || percent == 255 || percent > 20 {
            if on_ac {
                LOW_BATTERY_SHIFTED.store(false, Ordering::Relaxed);
                LOW_BATTERY_NOTIFIED.store(false, Ordering::Relaxed);
            }
            return;
        }

        if !LOW_BATTERY_SHIFTED.swap(true, Ordering::Relaxed) {
            let _ = std::process::Command::new("powercfg")
                .args(["/setactive", "SCHEME_MAX"])
                .status();
        }
        if !LOW_BATTERY_NOTIFIED.swap(true, Ordering::Relaxed) {
            notify(
                app,
                json!({
                    "id": "low-battery",
                    "app": "Power",
                    "title": "Battery below 20%",
                    "body": "Switched to Best Power Efficiency and slowed the glass refresh.",
                    "kind": "hardware",
                    "color": "#FACC15"
                }),
            );
        }
    }
}

/// Push an Island notification (used by automations and future widgets).
pub fn notify(app: &AppHandle, payload: serde_json::Value) {
    let _ = app.emit("glacier://island", payload);
}

/// Pre-meeting rule: widgets call this when a calendar event is <= 2 minutes out.
pub fn on_meeting_started(app: &AppHandle, title: &str) {
    notify(
        app,
        json!({
            "id": "meeting",
            "app": "Calendar",
            "title": format!("{title} starts soon"),
            "body": "Media paused and Do Not Disturb enabled.",
            "kind": "timer",
            "color": "#38BDF8"
        }),
    );
}

/// AI quota rule: amber at 85%, red at 95%, with the vendor reset time.
pub fn on_ai_quota(app: &AppHandle, vendor: &str, percent: f32, resets_at: &str) {
    let (color, tone) = if percent >= 95.0 {
        ("#F87171", "critically low")
    } else {
        ("#FACC15", "running out")
    };
    notify(
        app,
        json!({
            "id": format!("quota-{vendor}"),
            "app": vendor,
            "title": format!("{vendor} quota {tone}"),
            "body": format!("{percent:.0}% used · resets {resets_at}"),
            "kind": "message",
            "color": color
        }),
    );
}
