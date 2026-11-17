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
    EnumWindows, GetWindow, GetWindowLongW, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER,
    SW_RESTORE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowEntry {
    pub hwnd: isize,
    pub title: String,
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

pub fn windows_for_pid(pid: u32) -> Vec<WindowEntry> {
    let mut found: Vec<WindowEntry> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(enum_window), LPARAM(&mut found as *mut _ as isize));
    }
    found
        .into_iter()
        .filter(|window| {
            window.hwnd != 0 && super::process_manager::pid_for_hwnd(window.hwnd) == pid
        })
        .collect()
}

pub fn focus_pid(pid: u32) -> bool {
    let entries = windows_for_pid(pid);
    let Some(first) = entries.first() else {
        return false;
    };
    let hwnd = HWND(first.hwnd as *mut _);
    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        SetForegroundWindow(hwnd).as_bool()
    }
}

unsafe extern "system" fn enum_window(hwnd: HWND, data: LPARAM) -> BOOL {
    let out = &mut *(data.0 as *mut Vec<WindowEntry>);
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
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return TRUE;
    }
    out.push(WindowEntry {
        hwnd: hwnd.0 as isize,
        title: String::from_utf16_lossy(&title[..length as usize]),
    });
    TRUE
}
