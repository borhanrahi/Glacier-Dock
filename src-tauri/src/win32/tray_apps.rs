//! Apps currently registered in the Windows notification area overflow.
//!
//! Windows 11's taskbar is XAML, so the old `TB_GETBUTTON` walk of the tray
//! toolbar no longer works. The per-user `NotifyIconSettings` registry is the
//! supported inventory: every subkey describes one tray icon (executable, uid
//! or guid, and whether Windows promotes it to the visible tray). An icon is
//! actually present only while `Shell_NotifyIconGetRect` can find it - that is
//! the "minimized to tray" state we want, as opposed to every background
//! process on the machine.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use windows::core::{BOOL, GUID, PCWSTR};
use windows::Win32::Foundation::{ERROR_SUCCESS, HWND, LPARAM, TRUE};
use windows::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
};
use windows::Win32::UI::Shell::{Shell_NotifyIconGetRect, NOTIFYICONIDENTIFIER};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId};

use super::process_manager;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayApp {
    pub pid: u32,
    pub name: String,
    pub exe_path: Option<String>,
    pub hwnd: isize,
}

#[derive(Clone)]
struct WinInfo {
    hwnd: isize,
    pid: u32,
    exe: Option<String>,
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn open_settings_key() -> Option<HKEY> {
    let subkey = wide(r"Control Panel\NotifyIconSettings");
    let mut key = HKEY::default();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            Some(0),
            KEY_READ,
            &mut key,
        )
    };
    (status == ERROR_SUCCESS).then_some(key)
}

fn raw_value(key: HKEY, name: &str) -> Option<Vec<u8>> {
    let name = wide(name);
    let mut size = 0u32;
    let status = unsafe {
        RegQueryValueExW(
            key,
            PCWSTR(name.as_ptr()),
            None,
            None,
            None,
            Some(&mut size),
        )
    };
    if status != ERROR_SUCCESS || size == 0 {
        return None;
    }
    let mut buffer = vec![0u8; size as usize];
    let status = unsafe {
        RegQueryValueExW(
            key,
            PCWSTR(name.as_ptr()),
            None,
            None,
            Some(buffer.as_mut_ptr()),
            Some(&mut size),
        )
    };
    if status != ERROR_SUCCESS {
        return None;
    }
    buffer.truncate(size as usize);
    Some(buffer)
}

fn string_value(key: HKEY, name: &str) -> Option<String> {
    let bytes = raw_value(key, name)?;
    if bytes.len() < 2 {
        return None;
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    let end = units.iter().position(|unit| *unit == 0).unwrap_or(units.len());
    Some(String::from_utf16_lossy(&units[..end]))
}

fn dword_value(key: HKEY, name: &str) -> Option<u32> {
    let bytes = raw_value(key, name)?;
    let bytes: [u8; 4] = bytes.get(..4)?.try_into().ok()?;
    Some(u32::from_le_bytes(bytes))
}

unsafe extern "system" fn enum_windows(hwnd: HWND, data: LPARAM) -> BOOL {
    let out = &mut *(data.0 as *mut Vec<WinInfo>);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid != 0 {
        out.push(WinInfo {
            hwnd: hwnd.0 as isize,
            pid,
            exe: process_manager::process_name_image(pid),
        });
    }
    TRUE
}

fn all_windows() -> Vec<WinInfo> {
    let mut found = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(enum_windows), LPARAM(&mut found as *mut _ as isize));
    }
    found
}

fn file_name(path: &str) -> String {
    path.trim_end_matches('"')
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(path)
        .to_ascii_lowercase()
}

fn parse_guid(text: &str) -> Option<GUID> {
    GUID::try_from(text.trim().trim_start_matches('{').trim_end_matches('}')).ok()
}

fn icon_present(guid: Option<GUID>, hwnd: isize, uid: u32) -> bool {
    let mut identifier = NOTIFYICONIDENTIFIER {
        cbSize: std::mem::size_of::<NOTIFYICONIDENTIFIER>() as u32,
        ..Default::default()
    };
    if let Some(guid) = guid {
        identifier.guidItem = guid;
    } else {
        if hwnd == 0 {
            return false;
        }
        identifier.hWnd = HWND(hwnd as *mut _);
        identifier.uID = uid;
    }
    unsafe { Shell_NotifyIconGetRect(&identifier).is_ok() }
}

/// Third-party apps with a live icon in the Windows taskbar corner overflow.
/// Shell-owned icons (promoted to the visible tray) and stale registry entries
/// are excluded, so this matches the "Show hidden icons" flyout.
pub fn list() -> Vec<TrayApp> {
    let Some(root) = open_settings_key() else {
        return Vec::new();
    };

    let order = raw_value(root, "UIOrderList").unwrap_or_default();
    let windows = all_windows();

    // Fallback for tray-only processes that own no enumerable top-level window.
    let mut running: HashMap<String, Vec<(u32, Option<String>)>> = HashMap::new();
    for proc in process_manager::snapshot().processes {
        if let Some(path) = &proc.exe_path {
            running
                .entry(file_name(path))
                .or_default()
                .push((proc.pid, Some(path.clone())));
        }
    }

    let mut result: Vec<TrayApp> = Vec::new();
    let mut seen = HashSet::new();

    for chunk in order.chunks_exact(8) {
        let key = u64::from_le_bytes(chunk.try_into().unwrap()).to_string();
        let key = wide(&key);
        let mut sub = HKEY::default();
        if unsafe {
            RegOpenKeyExW(
                root,
                PCWSTR(key.as_ptr()),
                Some(0),
                KEY_READ,
                &mut sub,
            )
        } != ERROR_SUCCESS
        {
            continue;
        }

        let promoted = dword_value(sub, "IsPromoted").unwrap_or(0);
        let exe_path = string_value(sub, "ExecutablePath").unwrap_or_default();
        let guid = string_value(sub, "IconGuid").and_then(|value| parse_guid(&value));
        let uid = dword_value(sub, "UID").unwrap_or(0);
        let tooltip = string_value(sub, "InitialTooltip").unwrap_or_default();
        let _ = unsafe { RegCloseKey(sub) };

        // 1 = pinned to the visible tray, not the hidden-icons flyout.
        if promoted == 1 {
            continue;
        }
        let exe_file = file_name(&exe_path);
        if exe_file.is_empty() || exe_file == "explorer.exe" {
            continue;
        }

        let matches_window = |window: &WinInfo| {
            window
                .exe
                .as_deref()
                .is_some_and(|path| file_name(path) == exe_file)
        };

        // A guid identifies the icon on its own; a uid needs the exact hwnd
        // that registered it, so pick the matching window that owns the icon.
        let mut window = None;
        let present = if let Some(guid) = guid {
            let live = icon_present(Some(guid), 0, 0);
            if live {
                window = windows.iter().find(|window| matches_window(window));
            }
            live
        } else {
            window = windows
                .iter()
                .find(|window| matches_window(window) && icon_present(None, window.hwnd, uid));
            // Tray-only apps may have no enumerable window: fall back to any
            // running executable with the same name.
            window.is_some() || running.contains_key(&exe_file)
        };
        if !present {
            continue;
        }

        let (pid, path, hwnd) = match window {
            Some(window) => (window.pid, window.exe.clone(), window.hwnd),
            None => match running.get(&exe_file).and_then(|list| list.first()) {
                Some((pid, path)) => (*pid, path.clone(), 0),
                None => continue,
            },
        };
        if !seen.insert((pid, path.clone())) {
            continue;
        }

        let clean_tip = tooltip.trim();
        let name = if !clean_tip.is_empty()
            && !clean_tip.contains('\n')
            && !clean_tip.contains('\r')
            && clean_tip.chars().count() <= 40
        {
            clean_tip.to_string()
        } else {
            exe_file.trim_end_matches(".exe").to_string()
        };
        result.push(TrayApp {
            pid,
            name,
            exe_path: path,
            hwnd,
        });
    }

    let _ = unsafe { RegCloseKey(root) };
    result
}
