//! Minimized & tray-hidden user applications.
//!
//! Lists user-session apps that are currently minimized (all top-level windows
//! iconic) or registered in the Windows 11 notification overflow (`NotifyIconSettings`
//! with `IsPromoted != 1`), excluding Session 0 services, Windows shell hosts,
//! stale Chromium entries without a tray window, and apps that currently have
//! an un-minimized window open on screen.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::Serialize;
use windows::core::{BOOL, GUID, PCWSTR};
use windows::Win32::Foundation::{ERROR_SUCCESS, HWND, LPARAM, TRUE};
use windows::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
};
use windows::Win32::UI::Shell::{Shell_NotifyIconGetRect, NOTIFYICONIDENTIFIER};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, FindWindowExW, GetClassNameW, GetWindowThreadProcessId,
    HWND_MESSAGE,
};

use super::{dwm_preview, process_manager};

#[link(name = "kernel32")]
extern "system" {
    fn ProcessIdToSessionId(dwProcessId: u32, pSessionId: *mut u32) -> i32;
}

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
    exe_file: String,
    class_name: String,
}

struct EnumCtx<'a> {
    pid_to_file: &'a HashMap<u32, String>,
    out: Vec<WinInfo>,
}

fn session_id(pid: u32) -> Option<u32> {
    let mut session = 0u32;
    (unsafe { ProcessIdToSessionId(pid, &mut session) } != 0).then_some(session)
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

fn read_class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 96];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    if len <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..len as usize])
}

unsafe extern "system" fn enum_child_windows(hwnd: HWND, data: LPARAM) -> BOOL {
    let ctx = &mut *(data.0 as *mut EnumCtx<'_>);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if let Some(exe_file) = ctx.pid_to_file.get(&pid) {
        ctx.out.push(WinInfo {
            hwnd: hwnd.0 as isize,
            pid,
            exe_file: exe_file.clone(),
            class_name: read_class_name(hwnd),
        });
    }
    TRUE
}

unsafe extern "system" fn enum_top_windows(hwnd: HWND, data: LPARAM) -> BOOL {
    let ctx = &mut *(data.0 as *mut EnumCtx<'_>);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if let Some(exe_file) = ctx.pid_to_file.get(&pid) {
        ctx.out.push(WinInfo {
            hwnd: hwnd.0 as isize,
            pid,
            exe_file: exe_file.clone(),
            class_name: read_class_name(hwnd),
        });
    }
    let _ = EnumChildWindows(Some(hwnd), Some(enum_child_windows), data);
    TRUE
}

fn all_user_windows(pid_to_file: &HashMap<u32, String>) -> Vec<WinInfo> {
    let mut ctx = EnumCtx {
        pid_to_file,
        out: Vec::new(),
    };
    unsafe {
        let _ = EnumWindows(Some(enum_top_windows), LPARAM(&mut ctx as *mut _ as isize));

        let mut msg_hwnd = HWND::default();
        for _ in 0..4096 {
            let Ok(next) = FindWindowExW(
                Some(HWND_MESSAGE),
                (!msg_hwnd.0.is_null()).then_some(msg_hwnd),
                PCWSTR::null(),
                PCWSTR::null(),
            ) else {
                break;
            };
            if next.0.is_null() {
                break;
            }
            msg_hwnd = next;
            let mut pid = 0u32;
            GetWindowThreadProcessId(next, Some(&mut pid));
            if let Some(exe_file) = ctx.pid_to_file.get(&pid) {
                ctx.out.push(WinInfo {
                    hwnd: next.0 as isize,
                    pid,
                    exe_file: exe_file.clone(),
                    class_name: read_class_name(next),
                });
            }
        }
    }
    ctx.out
}

fn file_name(path: &str) -> String {
    path.trim_end_matches('"')
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(path)
        .to_ascii_lowercase()
}

fn is_shell_host(exe_file: &str) -> bool {
    matches!(
        exe_file,
        "explorer.exe"
            | "glacier-dock.exe"
            | "searchhost.exe"
            | "shellexperiencehost.exe"
            | "textinputhost.exe"
            | "startmenuexperiencehost.exe"
    )
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

/// Third-party apps minimized to a window or tucked in the Windows tray overflow.
pub fn list() -> Vec<TrayApp> {
    let self_pid = std::process::id();
    let self_session = session_id(self_pid);

    let mut pid_to_exe: HashMap<u32, String> = HashMap::new();
    let mut pid_to_file: HashMap<u32, String> = HashMap::new();
    let mut exe_to_procs: BTreeMap<String, Vec<(u32, String)>> = BTreeMap::new();

    for proc in process_manager::snapshot().processes {
        if proc.pid == self_pid {
            continue;
        }
        if let Some(expected) = self_session {
            if session_id(proc.pid) != Some(expected) {
                continue;
            }
        }
        let Some(path) = proc.exe_path else { continue };
        let exe_file = file_name(&path);
        if exe_file.is_empty() || is_shell_host(&exe_file) {
            continue;
        }
        pid_to_exe.insert(proc.pid, path.clone());
        pid_to_file.insert(proc.pid, exe_file.clone());
        exe_to_procs
            .entry(exe_file)
            .or_default()
            .push((proc.pid, path));
    }
    for list in exe_to_procs.values_mut() {
        list.sort_by_key(|(pid, _)| *pid);
    }

    let user_windows = all_user_windows(&pid_to_file);
    let mut chromium_exes: HashSet<String> = HashSet::new();
    let mut chromium_tray_exes: HashSet<String> = HashSet::new();
    for win in &user_windows {
        if win.class_name.starts_with("Chrome_WidgetWin_") {
            chromium_exes.insert(win.exe_file.clone());
        } else if win.class_name == "Chrome_StatusTrayWindow" {
            chromium_tray_exes.insert(win.exe_file.clone());
        }
    }

    let mut app_wins = dwm_preview::app_windows();
    app_wins.sort_by_key(|w| w.pid);

    let mut unminimized_exes: HashSet<String> = HashSet::new();
    for win in &app_wins {
        if !win.minimized {
            if let Some(exe_file) = pid_to_file.get(&win.pid) {
                unminimized_exes.insert(exe_file.clone());
            }
        }
    }

    let mut result: Vec<TrayApp> = Vec::new();
    let mut seen_exes: HashSet<String> = HashSet::new();

    // Pass 1: Windows notification overflow (NotifyIconSettings in UIOrderList order).
    if let Some(root) = open_settings_key() {
        let order = raw_value(root, "UIOrderList").unwrap_or_default();
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

            if promoted == 1 {
                continue;
            }
            let exe_file = file_name(&exe_path);
            if exe_file.is_empty() || is_shell_host(&exe_file) {
                continue;
            }
            if unminimized_exes.contains(&exe_file) {
                continue;
            }
            let Some(procs) = exe_to_procs.get(&exe_file) else {
                continue;
            };
            if guid.is_none()
                && chromium_exes.contains(&exe_file)
                && !chromium_tray_exes.contains(&exe_file)
            {
                continue;
            }

            let matched_win = if let Some(g) = guid {
                if icon_present(Some(g), 0, 0) {
                    user_windows.iter().find(|w| w.exe_file == exe_file)
                } else {
                    None
                }
            } else {
                user_windows
                    .iter()
                    .find(|w| w.exe_file == exe_file && icon_present(None, w.hwnd, uid))
            };

            let (pid, resolved_path, hwnd) = match matched_win {
                Some(win) => (
                    win.pid,
                    pid_to_exe.get(&win.pid).cloned(),
                    win.hwnd,
                ),
                None => match procs.first() {
                    Some((pid, path)) => (*pid, Some(path.clone()), 0),
                    None => continue,
                },
            };

            if !seen_exes.insert(exe_file.clone()) {
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
                exe_path: resolved_path,
                hwnd,
            });
        }
        let _ = unsafe { RegCloseKey(root) };
    }

    // Pass 2: Any user app whose windows are all currently minimized (iconic).
    for win in app_wins {
        if !win.minimized {
            continue;
        }
        let Some(exe_file) = pid_to_file.get(&win.pid) else {
            continue;
        };
        if is_shell_host(exe_file) || unminimized_exes.contains(exe_file) {
            continue;
        }
        if !seen_exes.insert(exe_file.clone()) {
            continue;
        }
        let exe_path = pid_to_exe.get(&win.pid).cloned();
        let trimmed = win.title.trim();
        let name = if !trimmed.is_empty() && trimmed.chars().count() <= 40 {
            trimmed.to_string()
        } else {
            exe_file.trim_end_matches(".exe").to_string()
        };
        result.push(TrayApp {
            pid: win.pid,
            name,
            exe_path,
            hwnd: win.hwnd,
        });
    }

    result
}
