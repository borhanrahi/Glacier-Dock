//! "Start with Windows" support.
//!
//! Writes a value under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
//! which is the same mechanism Task Manager's *Startup* tab and Settings →
//! Apps → Startup read. Because it is a plain Run entry, the user can disable
//! Glacier Dock from either place and Windows remembers that choice.

use std::path::PathBuf;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, REG_SZ,
};

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "Glacier Dock";

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn open_run_key() -> Result<HKEY, String> {
    let subkey = wide(RUN_KEY);
    let mut key = HKEY::default();
    let status = unsafe { RegCreateKeyW(HKEY_CURRENT_USER, PCWSTR(subkey.as_ptr()), &mut key) };
    if status != ERROR_SUCCESS {
        return Err(format!("could not open the Run registry key ({})", status.0));
    }
    Ok(key)
}

/// Path of the running executable, quoted for a Run command line.
fn command_line() -> Result<Vec<u16>, String> {
    let exe: PathBuf = std::env::current_exe().map_err(|error| error.to_string())?;
    Ok(wide(&format!("\"{}\"", exe.display())))
}

/// Register or remove the Run entry. Safe to call on every save.
pub fn apply(enabled: bool) -> Result<(), String> {
    let key = open_run_key()?;
    let name = wide(VALUE_NAME);

    let status = if enabled {
        let command = command_line()?;
        let bytes: &[u8] = unsafe {
            std::slice::from_raw_parts(command.as_ptr().cast::<u8>(), std::mem::size_of_val(&command[..]))
        };
        unsafe { RegSetValueExW(key, PCWSTR(name.as_ptr()), None, REG_SZ, Some(bytes)) }
    } else {
        unsafe { RegDeleteValueW(key, PCWSTR(name.as_ptr())) }
    };

    let _ = unsafe { RegCloseKey(key) };

    if status == ERROR_SUCCESS || (!enabled && status == ERROR_FILE_NOT_FOUND) {
        Ok(())
    } else {
        Err(format!("could not update the startup entry ({})", status.0))
    }
}

/// Whether Glacier Dock currently has a Run entry of its own.
pub fn is_registered() -> bool {
    let Ok(key) = open_run_key() else {
        return false;
    };
    let name = wide(VALUE_NAME);
    let mut size = 0u32;
    let status = unsafe {
        windows::Win32::System::Registry::RegQueryValueExW(
            key,
            PCWSTR(name.as_ptr()),
            None,
            None,
            None,
            Some(&mut size),
        )
    };
    let _ = unsafe { RegCloseKey(key) };
    status == ERROR_SUCCESS
}
