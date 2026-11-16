//! Start Menu app discovery and launching.
//!
//! Walks the per-user and machine Start Menu folders for `.lnk` / `.url` /
//! `.appref-ms` entries. No shell COM, no registry scanning: this is the same
//! set Windows shows in the Start list, read straight off disk.

use std::path::{Path, PathBuf};

use serde::Serialize;
use windows::core::{w, PCWSTR};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

fn start_menu_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        roots.push(
            PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    if let Ok(programdata) = std::env::var("PROGRAMDATA") {
        roots.push(
            PathBuf::from(programdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    roots
}

fn is_shortcut(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref(),
        Some("lnk") | Some("url") | Some("appref-ms")
    )
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<InstalledApp>) {
    if depth > 4 || out.len() > 600 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, depth + 1, out);
        } else if is_shortcut(&path) {
            let Some(name) = path.file_stem().map(|n| n.to_string_lossy().to_string()) else {
                continue;
            };
            if name.is_empty() {
                continue;
            }
            out.push(InstalledApp {
                name,
                path: path.to_string_lossy().to_string(),
            });
        }
    }
}

/// Deduplicated Start Menu apps, alphabetically sorted.
pub fn installed_apps(limit: usize) -> Vec<InstalledApp> {
    let mut found = Vec::new();
    for root in start_menu_roots() {
        walk(&root, 0, &mut found);
    }
    found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    found.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    found.truncate(limit);
    found
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Shell-execute a shortcut, executable or URL.
pub fn launch(path: &str) -> Result<(), String> {
    let file = wide(path);
    let result = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            PCWSTR(file.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW returns a value <= 32 on failure.
    if result.0 as isize <= 32 {
        Err(format!("could not launch {path}"))
    } else {
        Ok(())
    }
}
