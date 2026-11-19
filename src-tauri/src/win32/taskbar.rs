//! Windows taskbar replacement & desktop work-area bookkeeping.
//!
//! Hiding `Shell_TrayWnd` / `Shell_SecondaryTrayWnd` is the easy part; the hard
//! part is never leaving a user without a taskbar or proper maximized window
//! margins. Every hide writes a journal (`%APPDATA%\GlacierDock\taskbar-state.txt`)
//! recording which windows were actually visible and the original work area
//! (`orig_work=l,t,r,b`), which is replayed by:
//!
//!   * normal exit (`RunEvent::Exit`),
//!   * the panic hook in `main.rs`,
//!   * `glacier-dock.exe --restore-taskbar` (used by the uninstaller / recovery),
//!   * a watchdog thread that re-hides after an Explorer restart.

use std::path::PathBuf;

use windows::core::{w, BOOL};
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetClassNameW, GetTopWindow, GetWindow, IsWindowVisible, ShowWindow,
    SystemParametersInfoW, GW_HWNDNEXT, SPI_GETWORKAREA, SPI_SETWORKAREA, SW_HIDE, SW_SHOW,
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

use crate::config::{self, AppConfig, Edge, Shape};

pub const JOURNAL: &str = "taskbar-state.txt";
const MAX_TASKBARS: usize = 8;
const SPIF_SENDWININICHANGE: SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS =
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(2);

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

fn current_work_area() -> Option<RECT> {
    let mut rect = RECT::default();
    unsafe {
        SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            Some(&mut rect as *mut RECT as *mut _),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .ok()?;
    }
    Some(rect)
}

unsafe extern "system" fn work_area_enum_proc(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _clip: *mut RECT,
    data: LPARAM,
) -> BOOL {
    let out = &mut *(data.0 as *mut Vec<RECT>);
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if GetMonitorInfoW(hmonitor, &mut info).as_bool() {
        out.push(info.rcWork);
    }
    BOOL(1)
}

fn all_work_areas() -> Vec<RECT> {
    let mut works: Vec<RECT> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(work_area_enum_proc),
            LPARAM(&mut works as *mut Vec<RECT> as isize),
        );
    }
    if works.is_empty() {
        if let Some(work) = current_work_area() {
            works.push(work);
        }
    }
    works
}

fn set_work_area(mut rect: RECT) {
    unsafe {
        let _ = SystemParametersInfoW(
            SPI_SETWORKAREA,
            0,
            Some(&mut rect as *mut RECT as *mut _),
            SPIF_SENDWININICHANGE,
        );
    }
}

fn parse_rect(text: &str) -> Option<RECT> {
    let mut parts = text.split(',').filter_map(|p| p.trim().parse::<i32>().ok());
    Some(RECT {
        left: parts.next()?,
        top: parts.next()?,
        right: parts.next()?,
        bottom: parts.next()?,
    })
}

/// Journal lines per taskbar (`hwnd=<hex> visible=<0|1>`) plus original monitor work areas.
fn write_journal(visible_before: &[(HWND, bool)], orig_works: &[RECT]) {
    let dir = config::data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let mut out = String::from("# Glacier Dock taskbar journal — replay to restore\n");
    for r in orig_works {
        out.push_str(&format!(
            "work={},{},{},{}\n",
            r.left, r.top, r.right, r.bottom
        ));
    }
    for (hwnd, visible) in visible_before {
        out.push_str(&format!(
            "hwnd=0x{:X} visible={}\n",
            hwnd.0 as usize,
            u8::from(*visible)
        ));
    }
    let _ = std::fs::write(dir.join(JOURNAL), out);
}

fn read_journal() -> (Vec<(usize, bool)>, Vec<RECT>) {
    let Ok(text) = std::fs::read_to_string(journal_path()) else {
        return (Vec::new(), Vec::new());
    };
    let mut entries = Vec::new();
    let mut orig_works = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }
        if let Some(coords) = trimmed
            .strip_prefix("work=")
            .or_else(|| trimmed.strip_prefix("orig_work="))
        {
            if let Some(rect) = parse_rect(coords) {
                orig_works.push(rect);
            }
            continue;
        }
        let mut hwnd = None;
        let mut visible = true;
        for part in trimmed.split_whitespace() {
            if let Some(hex) = part.strip_prefix("hwnd=") {
                hwnd = usize::from_str_radix(hex.trim_start_matches("0x"), 16).ok();
            } else if let Some(flag) = part.strip_prefix("visible=") {
                visible = flag != "0";
            }
        }
        if let Some(h) = hwnd {
            entries.push((h, visible));
        }
    }
    (entries, orig_works)
}

/// Reserve screen work area matching each Glacier Dock bar across all monitors so
/// maximized windows stop right beside/above the dock like the native taskbar.
pub fn apply_work_area(cfg: &AppConfig) {
    let monitors = {
        let cached = super::monitors::cached_monitors();
        if cached.is_empty() {
            super::monitors::enumerate()
        } else {
            cached
        }
    };
    for monitor in monitors {
        let dock = cfg
            .docks
            .iter()
            .find(|d| d.monitor == monitor.device)
            .cloned()
            .unwrap_or_default();

        let (_, bar) = dock.size.metrics();
        let margin = if dock.shape == Shape::Attached {
            0.0
        } else {
            cfg.appearance.edge_margin.min(12.0)
        };
        let reserve = ((bar + margin) * monitor.scale)
            .round()
            .clamp(40.0, 88.0 * monitor.scale) as i32;

        let mut rect = RECT {
            left: monitor.x,
            top: monitor.y,
            right: monitor.x + monitor.width,
            bottom: monitor.y + monitor.height,
        };
        match dock.edge {
            Edge::Bottom => rect.bottom -= reserve,
            Edge::Top => rect.top += reserve,
            Edge::Left => rect.left += reserve,
            Edge::Right => rect.right -= reserve,
        }
        set_work_area(rect);
    }
}

/// Hide every taskbar, journaling who was visible and original work areas so restore is exact.
pub fn hide() -> Result<(), String> {
    let bars = all_taskbars();
    if bars.is_empty() {
        return Err("no Windows taskbar window found".into());
    }
    let existing_works = if journal_path().exists() {
        read_journal().1
    } else {
        Vec::new()
    };
    let orig_works = if existing_works.is_empty() {
        all_work_areas()
    } else {
        existing_works
    };
    let before: Vec<(HWND, bool)> = bars.iter().map(|h| (*h, is_visible(*h))).collect();
    write_journal(&before, &orig_works);

    for (hwnd, was_visible) in &before {
        if *was_visible {
            set_visible(*hwnd, false);
        }
    }
    Ok(())
}

/// Restore the taskbars and work areas recorded in the journal, then delete it.
pub fn restore() {
    let (entries, orig_works) = read_journal();
    if entries.is_empty() {
        // Journal missing or unreadable: bring the primary back unconditionally.
        if let Some(primary) = primary_taskbar() {
            set_visible(primary, true);
        }
        for bar in secondary_taskbars() {
            set_visible(bar, true);
        }
        for work in orig_works {
            set_work_area(work);
        }
        return;
    }

    for (raw, was_visible) in entries {
        if was_visible && raw != 0 {
            let hwnd = HWND(raw as *mut core::ffi::c_void);
            if !is_visible(hwnd) {
                set_visible(hwnd, true);
            }
        }
    }

    for work in orig_works {
        set_work_area(work);
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
