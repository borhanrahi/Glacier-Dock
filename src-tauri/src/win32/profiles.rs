//! Automatic context profiles.
//!
//! Polls the foreground executable and switches the active profile when it
//! matches a trigger (`Work`, `Coding`, `Gaming`, …). The dock listens for
//! `glacier://profile` and re-renders its widget set — no rebuild, no restart.

use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

use crate::config;

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_exe = String::new();
        loop {
            std::thread::sleep(Duration::from_millis(1500));

            let Some(exe) = foreground_exe() else {
                continue;
            };
            if exe.eq_ignore_ascii_case(&last_exe) {
                continue;
            }
            last_exe = exe.clone();

            let mut cfg = config::load(&app);
            let matched = cfg
                .profiles
                .iter()
                .find(|profile| {
                    profile
                        .triggers
                        .iter()
                        .any(|trigger| trigger.eq_ignore_ascii_case(&exe))
                })
                .cloned();

            let Some(profile) = matched else { continue };
            if cfg.active_profile == profile.name {
                continue;
            }

            cfg.active_profile = profile.name.clone();
            config::save(&app, &cfg);
            let _ = app.emit("glacier://profile", &profile);
        }
    });
}

fn foreground_exe() -> Option<String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        super::process_manager::image_name(pid)
    }
}
