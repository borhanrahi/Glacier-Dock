//! Native live window previews via DWM thumbnails.
//!
//! The dock asks for a preview of a running app; Rust finds the app's visible
//! top-level window and registers it as a thumbnail on the preview webview's
//! HWND, so the preview is a live compositor copy (no screen capture, no
//! frame copying).

use std::sync::Mutex;

use serde::Serialize;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DwmRegisterThumbnail, DwmUnregisterThumbnail,
    DwmUpdateThumbnailProperties, DWMWA_CLOAKED, DWM_THUMBNAIL_PROPERTIES,
    DWM_TNP_RECTDESTINATION, DWM_TNP_SOURCECLIENTAREAONLY, DWM_TNP_VISIBLE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowLongW, GetWindowTextW, IsIconic, IsWindowVisible,
    SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, SW_RESTORE, WS_EX_APPWINDOW,
    WS_EX_TOOLWINDOW,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowEntry {
    pub hwnd: isize,
    pub title: String,
}

#[derive(Clone, Debug)]
pub struct AppWindowState {
    pub hwnd: isize,
    pub pid: u32,
    pub title: String,
    pub minimized: bool,
}

static THUMBNAILS: Mutex<Vec<(isize, isize)>> = Mutex::new(Vec::new());

pub fn attach(preview: isize, source: isize, width: u32, height: u32) -> Result<(), String> {
    detach(preview);
    unsafe {
        let thumbnail = DwmRegisterThumbnail(HWND(preview as *mut _), HWND(source as *mut _))
            .map_err(|e| format!("DwmRegisterThumbnail: {e}"))?;

        let properties = DWM_THUMBNAIL_PROPERTIES {
            dwFlags: DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_SOURCECLIENTAREAONLY,
            rcDestination: RECT {
                left: 0,
                top: 0,
                right: width as i32,
                bottom: height as i32,
            },
            rcSource: RECT::default(),
            opacity: 255,
            fVisible: TRUE,
            fSourceClientAreaOnly: TRUE,
        };
        DwmUpdateThumbnailProperties(thumbnail, &properties)
            .map_err(|e| format!("DwmUpdateThumbnailProperties: {e}"))?;

        if let Ok(mut list) = THUMBNAILS.lock() {
            list.push((preview, thumbnail));
        }
    }
    Ok(())
}

pub fn detach(preview: isize) {
    let Ok(mut list) = THUMBNAILS.lock() else { return };
    let (matching, remaining): (Vec<_>, Vec<_>) =
        list.drain(..).partition(|(hwnd, _)| *hwnd == preview);
    *list = remaining;
    for (_, thumbnail) in matching {
        unsafe {
            let _ = DwmUnregisterThumbnail(thumbnail);
        }
    }
}

pub fn app_windows() -> Vec<AppWindowState> {
    let mut found: Vec<AppWindowState> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(enum_app_window), LPARAM(&mut found as *mut _ as isize));
    }
    found
}

pub fn windows_for_pid(pid: u32) -> Vec<WindowEntry> {
    app_windows()
        .into_iter()
        .filter(|window| window.pid == pid)
        .map(|window| WindowEntry {
            hwnd: window.hwnd,
            title: window.title,
        })
        .collect()
}

pub fn focus_pid(pid: u32) -> bool {
    let entries: Vec<AppWindowState> = app_windows()
        .into_iter()
        .filter(|window| window.pid == pid)
        .collect();
    let Some(target) = entries.iter().find(|w| w.minimized).or_else(|| entries.first()) else {
        return false;
    };
    let hwnd = HWND(target.hwnd as *mut _);
    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        SetForegroundWindow(hwnd).as_bool()
    }
}

pub fn focus_hwnd_or_pid(hwnd: isize, pid: u32) -> bool {
    if hwnd != 0 {
        let target = HWND(hwnd as *mut _);
        unsafe {
            if IsWindowVisible(target).as_bool() {
                if IsIconic(target).as_bool() {
                    let _ = ShowWindow(target, SW_RESTORE);
                }
                if SetForegroundWindow(target).as_bool() {
                    return true;
                }
            }
        }
    }
    focus_pid(pid)
}

unsafe extern "system" fn enum_app_window(hwnd: HWND, data: LPARAM) -> BOOL {
    let out = &mut *(data.0 as *mut Vec<AppWindowState>);
    if !IsWindowVisible(hwnd).as_bool() {
        return TRUE;
    }
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if (ex_style & WS_EX_TOOLWINDOW.0) != 0 {
        return TRUE;
    }
    let has_owner = GetWindow(hwnd, GW_OWNER).is_ok_and(|o| !o.0.is_null());
    if has_owner && (ex_style & WS_EX_APPWINDOW.0) == 0 {
        return TRUE;
    }
    let mut cloaked: u32 = 0;
    let _ = DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED,
        &mut cloaked as *mut u32 as *mut _,
        std::mem::size_of::<u32>() as u32,
    );
    if cloaked != 0 {
        return TRUE;
    }
    let mut title = [0u16; 256];
    let length = GetWindowTextW(hwnd, &mut title);
    if length <= 0 {
        return TRUE;
    }
    let pid = super::process_manager::pid_for_hwnd(hwnd.0 as isize);
    if pid == 0 {
        return TRUE;
    }
    out.push(AppWindowState {
        hwnd: hwnd.0 as isize,
        pid,
        title: String::from_utf16_lossy(&title[..length as usize]),
        minimized: IsIconic(hwnd).as_bool(),
    });
    TRUE
}
