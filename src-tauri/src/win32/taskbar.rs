//! Windows taskbar replacement bookkeeping.
//!
//! Hiding `Shell_TrayWnd` / `Shell_SecondaryTrayWnd` is the easy part; the hard
//! part is never leaving a user without a taskbar. Every hide writes a journal
//! (`%APPDATA%\GlacierDock\taskbar-state.txt`) recording which windows were
//! actually visible, and that journal is replayed by:
//!
//!   * normal exit (`RunEvent::Exit`),
//!   * the panic hook in `main.rs`,
//!   * `glacier-dock.exe --restore-taskbar` (used by the uninstaller / recovery),
//!   * a watchdog thread that re-hides after an Explorer restart.

use std::path::PathBuf;

use windows::core::w;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetClassNameW, GetTopWindow, GetWindow, IsWindowVisible, ShowWindow, GW_HWNDNEXT,
    SW_HIDE, SW_SHOW,
};

use crate::config;

pub const JOURNAL: &str = "taskbar-state.txt";
const MAX_TASKBARS: usize = 8;

fn journal_path() -> PathBuf {
    config::data_dir().join(JOURNAL)
}

/// True when a hide is currently journaled (i.e. we owe the user a taskbar).
pub fn hides_taskbar() -> bool {
    journal_path().exists()
}

fn primary_taskbar() -> Option<HWND> {
    unsafe { FindWindowW(w!("Shell_TrayWnd"), None).ok() }
}

/// Secondary taskbars on non-primary monitors.
fn secondary_taskbars() -> Vec<HWND> {
    let mut found = Vec::new();
    unsafe {
        let mut hwnd = match GetTopWindow(None) {
            Ok(h) => h,
            Err(_) => return found,
        };
        while !hwnd.0.is_null() && found.len() < MAX_TASKBARS {
            let mut buf = [0u16; 128];
            let len = GetClassNameW(hwnd, &mut buf);
            if len > 0 && String::from_utf16_lossy(&buf[..len as usize]) == "Shell_SecondaryTrayWnd" {
                found.push(hwnd);
            }
            hwnd = match GetWindow(hwnd, GW_HWNDNEXT) {
                Ok(next) => next,
                Err(_) => break,
            };
        }
    }
    found
}

fn all_taskbars() -> Vec<HWND> {
    let mut bars = Vec::new();
    if let Some(primary) = primary_taskbar() {
        bars.push(primary);
    }
    bars.extend(secondary_taskbars());
    bars
}

fn is_visible(hwnd: HWND) -> bool {
    unsafe { IsWindowVisible(hwnd).as_bool() }
}

fn set_visible(hwnd: HWND, visible: bool) {
    unsafe {
        let _ = ShowWindow(hwnd, if visible { SW_SHOW } else { SW_HIDE });
    }
}

/// One journal line per taskbar: `hwnd=<hex> visible=<0|1>`.
fn write_journal(visible_before: &[(HWND, bool)]) {
    let dir = config::data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let mut out = String::from("# Glacier Dock taskbar journal — replay to restore\n");
    for (hwnd, visible) in visible_before {
        out.push_str(&format!(
            "hwnd=0x{:X} visible={}\n",
            hwnd.0 as usize,
            u8::from(*visible)
        ));
    }
    let _ = std::fs::write(dir.join(JOURNAL), out);
}

fn read_journal() -> Vec<(usize, bool)> {
    let Ok(text) = std::fs::read_to_string(journal_path()) else {
        return Vec::new();
    };
    text.lines()
        .filter(|line| !line.starts_with('#') && !line.trim().is_empty())
        .filter_map(|line| {
            let mut hwnd = None;
            let mut visible = true;
            for part in line.split_whitespace() {
                if let Some(hex) = part.strip_prefix("hwnd=") {
                    hwnd = usize::from_str_radix(hex.trim_start_matches("0x"), 16).ok();
                } else if let Some(flag) = part.strip_prefix("visible=") {
                    visible = flag != "0";
                }
            }
            hwnd.map(|h| (h, visible))
        })
        .collect()
}

/// Hide every taskbar, journaling who was visible so restore is exact.
pub fn hide() -> Result<(), String> {
    let bars = all_taskbars();
    if bars.is_empty() {
        return Err("no Windows taskbar window found".into());
    }
    let before: Vec<(HWND, bool)> = bars.iter().map(|h| (*h, is_visible(*h))).collect();
    write_journal(&before);

    for (hwnd, was_visible) in &before {
        if *was_visible {
            set_visible(*hwnd, false);
        }
    }
    Ok(())
}

/// Restore the taskbars recorded in the journal, then delete it.
pub fn restore() {
    let entries = read_journal();
    if entries.is_empty() {
        // Journal missing or unreadable: bring the primary back unconditionally.
        if let Some(primary) = primary_taskbar() {
            set_visible(primary, true);
        }
        for bar in secondary_taskbars() {
            set_visible(bar, true);
        }
        return;
    }

    for (raw, was_visible) in entries {
        if was_visible && raw != 0 {
            let hwnd = HWND(raw as *mut core::ffi::c_void);
            if is_visible(hwnd) {
                continue;
            }
            set_visible(hwnd, true);
        }
    }

    let _ = std::fs::remove_file(journal_path());
}

/// Entry point for `--restore-taskbar`.
pub fn restore_from_journal() {
    restore();
    // Belt and braces: the primary taskbar always comes back.
    if let Some(primary) = primary_taskbar() {
        set_visible(primary, true);
    }
}

/// Explorer restart / crash recovery: if our journal says we still own the
/// taskbar, keep it hidden. This replaces the old `TaskbarCreated` broadcast
/// listener with something that also survives a shell restart mid-hide.
pub fn spawn_watchdog() {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        if !hides_taskbar() {
            return;
        }
        for bar in all_taskbars() {
            if is_visible(bar) {
                set_visible(bar, false);
            }
        }
    });
}
