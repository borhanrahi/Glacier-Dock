//! Click-through headroom.
//!
//! The dock window is sized at startup for the maximum 1.35x magnified icon
//! height plus shadow padding, so the OS window never resizes during hover.
//! Everything outside the visible pill must pass mouse input through to
//! whatever is behind it: the window is subclassed and `WM_NCHITTEST` answers
//! `HTTRANSPARENT` outside the pill rect and `HTCLIENT` inside it.

use std::sync::Mutex;

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, HTCLIENT, HTTRANSPARENT, WM_NCHITTEST,
};

const SUBCLASS_ID: usize = 0x64_4F_43_4B; // "dOCK"

/// (hwnd, interactive rect in client coords)
static RECTS: Mutex<Vec<(isize, Rect)>> = Mutex::new(Vec::new());

#[derive(Clone, Copy, Debug, Default)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl Rect {
    fn contains(self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right && y >= self.top && y < self.bottom
    }
}

fn interactive_rect(hwnd: isize) -> Option<Rect> {
    RECTS
        .lock()
        .ok()?
        .iter()
        .find(|(h, _)| *h == hwnd)
        .map(|(_, r)| *r)
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
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
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Subclass a dock window. Safe to call once per window.
pub fn install(raw_hwnd: isize) -> bool {
    let hwnd = HWND(raw_hwnd as *mut core::ffi::c_void);
    unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0).as_bool() }
}

/// Update the pill rect (client coordinates). Called from the frontend after
/// layout, and again on every size/edge change.
pub fn set_rect(raw_hwnd: isize, x: i32, y: i32, width: i32, height: i32) {
    let rect = Rect {
        left: x,
        top: y,
        right: x + width.max(1),
        bottom: y + height.max(1),
    };
    if let Ok(mut rects) = RECTS.lock() {
        match rects.iter_mut().find(|(h, _)| *h == raw_hwnd) {
            Some(entry) => entry.1 = rect,
            None => rects.push((raw_hwnd, rect)),
        }
    }
}

#[allow(dead_code)] // used when a dock window is destroyed on display removal
pub fn clear(raw_hwnd: isize) {
    if let Ok(mut rects) = RECTS.lock() {
        rects.retain(|(h, _)| *h != raw_hwnd);
    }
}
