//! Global `Alt + Space` Spotlight hotkey.
//!
//! `RegisterHotKey` posts `WM_HOTKEY` to the registering thread, so this module
//! owns a dedicated message loop. Registration failing (another app already
//! owns the chord) is logged and non-fatal — the dock pill still opens
//! Spotlight.

use std::sync::OnceLock;

use tauri::AppHandle;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, MOD_ALT, MOD_NOREPEAT, VK_SPACE,
};
use windows::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY};

static APP: OnceLock<AppHandle> = OnceLock::new();
const HOTKEY_ID: i32 = 0x6C11;

pub fn spawn(app: AppHandle) {
    let _ = APP.set(app);
    std::thread::spawn(move || unsafe {
        if let Err(err) = RegisterHotKey(None, HOTKEY_ID, MOD_ALT | MOD_NOREPEAT, VK_SPACE.0 as u32)
        {
            eprintln!("glacier: Alt+Space is unavailable: {err}");
            return;
        }

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == HOTKEY_ID {
                if let Some(app) = APP.get() {
                    crate::toggle_spotlight(app);
                }
            }
        }
    });
}
