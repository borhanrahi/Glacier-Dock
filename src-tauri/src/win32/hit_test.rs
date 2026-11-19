//! True click-through headroom for WebView2 dock windows.
//!
//! Coordinates `WebviewWindow::set_ignore_cursor_events(passthrough)` through Tauri/tao's
//! own `WindowState` (plus `WM_STYLECHANGING` / `WM_NCHITTEST` guards) so every
//! transparent pixel outside the active dock pill / expanded hover bounds passes
//! clicks, hovers, and scrolls straight through to desktop windows underneath.

use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GWL_EXSTYLE, HTCLIENT, HTTRANSPARENT, WM_NCHITTEST, WM_NCDESTROY,
    WM_STYLECHANGING, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

const SUBCLASS_ID: usize = 0x64_4F_43_4B; // "dOCK"

#[repr(C)]
struct StyleStruct {
    style_old: u32,
    style_new: u32,
}

#[derive(Clone, Copy, Debug, Default)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl Rect {
    fn contains(self, x: i32, y: i32) -> bool {
        self.right > self.left
            && self.bottom > self.top
            && x >= self.left
            && x < self.right
            && y >= self.top
            && y < self.bottom
    }
}

#[derive(Clone, Debug)]
struct HitEntry {
    hwnd: isize,
    label: String,
    rect: Rect,
    passthrough: bool,
}

static RECTS: Mutex<Vec<HitEntry>> = Mutex::new(Vec::new());
static APP: OnceLock<AppHandle> = OnceLock::new();
static WATCHER: OnceLock<()> = OnceLock::new();

fn apply_passthrough(label: &str, passthrough: bool) {
    if label.is_empty() {
        return;
    }
    if let Some(app) = APP.get() {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_ignore_cursor_events(passthrough);
        }
    }
}

fn cursor_inside(raw_hwnd: isize, rect: Rect) -> Option<bool> {
    if rect.right <= rect.left || rect.bottom <= rect.top {
        return Some(false);
    }
    let mut pt = POINT::default();
    unsafe {
        if GetCursorPos(&mut pt).is_err() {
            return None;
        }
        if !ScreenToClient(HWND(raw_hwnd as *mut _), &mut pt).as_bool() {
            return None;
        }
    }
    Some(rect.contains(pt.x, pt.y))
}

fn spawn_watcher() {
    WATCHER.get_or_init(|| {
        std::thread::Builder::new()
            .name("glacier-hit-watcher".into())
            .spawn(|| loop {
                std::thread::sleep(std::time::Duration::from_millis(10));
                let mut pt = POINT::default();
                if unsafe { GetCursorPos(&mut pt).is_err() } {
                    continue;
                }

                let mut changes: Vec<(String, bool)> = Vec::new();
                if let Ok(mut entries) = RECTS.lock() {
                    for entry in entries.iter_mut() {
                        let mut client = pt;
                        let inside = entry.rect.right > entry.rect.left
                            && entry.rect.bottom > entry.rect.top
                            && unsafe {
                                ScreenToClient(HWND(entry.hwnd as *mut _), &mut client).as_bool()
                            }
                            && entry.rect.contains(client.x, client.y);
                        let want_passthrough = !inside;
                        if want_passthrough != entry.passthrough {
                            entry.passthrough = want_passthrough;
                            if !entry.label.is_empty() {
                                changes.push((entry.label.clone(), want_passthrough));
                            }
                        }
                    }
                }

                for (label, want_passthrough) in changes {
                    apply_passthrough(&label, want_passthrough);
                    if want_passthrough {
                        if let Some(app) = APP.get() {
                            let _ = app.emit_to(label.as_str(), "glacier://dock-leave", ());
                        }
                    }
                }
            })
            .ok();
    });
}

fn interactive_rect(hwnd: isize) -> Option<Rect> {
    RECTS
        .try_lock()
        .ok()?
        .iter()
        .find(|entry| entry.hwnd == hwnd)
        .map(|entry| entry.rect)
}

fn is_passthrough(raw_hwnd: isize) -> bool {
    RECTS
        .try_lock()
        .ok()
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| entry.hwnd == raw_hwnd)
                .map(|entry| entry.passthrough)
        })
        .unwrap_or(true)
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    id: usize,
    _data: usize,
) -> LRESULT {
    if msg == WM_STYLECHANGING && (wparam.0 as i32) == GWL_EXSTYLE.0 && lparam.0 != 0 {
        let styles = &mut *(lparam.0 as *mut StyleStruct);
        styles.style_new |= WS_EX_TOOLWINDOW.0;
        styles.style_new &= !WS_EX_APPWINDOW.0;
        if is_passthrough(hwnd.0 as isize) {
            styles.style_new |= WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0;
        }
        return LRESULT(0);
    }

    if msg == WM_NCHITTEST {
        if let Some(rect) = interactive_rect(hwnd.0 as isize) {
            let mut pt = POINT::default();
            if GetCursorPos(&mut pt).is_ok() && ScreenToClient(hwnd, &mut pt).as_bool() {
                return if rect.contains(pt.x, pt.y) {
                    LRESULT(HTCLIENT as isize)
                } else {
                    LRESULT(HTTRANSPARENT as isize)
                };
            }
        }
    }

    if msg == WM_NCDESTROY {
        let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), id);
        clear(hwnd.0 as isize);
    }

    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Subclass a dock window, start it click-through, and start the cursor watcher.
pub fn install(app: &AppHandle, label: &str, raw_hwnd: isize) -> bool {
    let _ = APP.set(app.clone());
    let hwnd = HWND(raw_hwnd as *mut core::ffi::c_void);
    let ok = unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0).as_bool() };

    let want_passthrough = if let Ok(mut entries) = RECTS.lock() {
        if let Some(existing) = entries.iter_mut().find(|entry| entry.hwnd == raw_hwnd) {
            existing.label = label.to_string();
            let inside = cursor_inside(raw_hwnd, existing.rect).unwrap_or(false);
            let want = !inside;
            existing.passthrough = want;
            want
        } else {
            let rect = Rect::default();
            let inside = cursor_inside(raw_hwnd, rect).unwrap_or(false);
            let want = !inside;
            entries.push(HitEntry {
                hwnd: raw_hwnd,
                label: label.to_string(),
                rect,
                passthrough: want,
            });
            want
        }
    } else {
        true
    };

    apply_passthrough(label, want_passthrough);
    spawn_watcher();
    ok
}

/// Update the interactive hit rect (client coordinates). Called from the frontend
/// on resting layout changes and dynamically during hover/popover interactions.
pub fn set_rect(raw_hwnd: isize, x: i32, y: i32, width: i32, height: i32) {
    let rect = Rect {
        left: x,
        top: y,
        right: x + width.max(1),
        bottom: y + height.max(1),
    };
    let inside = cursor_inside(raw_hwnd, rect).unwrap_or(false);
    let want_passthrough = !inside;

    let label_to_apply = if let Ok(mut entries) = RECTS.lock() {
        match entries.iter_mut().find(|entry| entry.hwnd == raw_hwnd) {
            Some(entry) => {
                entry.rect = rect;
                if entry.passthrough != want_passthrough {
                    entry.passthrough = want_passthrough;
                    if entry.label.is_empty() {
                        None
                    } else {
                        Some(entry.label.clone())
                    }
                } else {
                    None
                }
            }
            None => {
                entries.push(HitEntry {
                    hwnd: raw_hwnd,
                    label: String::new(),
                    rect,
                    passthrough: want_passthrough,
                });
                None
            }
        }
    } else {
        None
    };

    if let Some(label) = label_to_apply {
        apply_passthrough(&label, want_passthrough);
    }
}

pub fn clear(raw_hwnd: isize) {
    if let Ok(mut entries) = RECTS.lock() {
        entries.retain(|entry| entry.hwnd != raw_hwnd);
    }
}
