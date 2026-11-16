//! Glacier Dock — application entry.
//!
//! Milestone 1 adds the Win32 shell (taskbar journaling, monitor enumeration,
//! single-instance guard). For now this boots the dock window only.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start Glacier Dock");
}
