//! Jump-list destinations from an STA COM worker.
//!
//! Full `ICustomDestinationList` registration is a later milestone; this reads
//! the same data Windows puts in every jump list — the Recent folder — from a
//! single-threaded apartment, which is where shell link data must be touched.

use serde::Serialize;
use windows::core::PCWSTR;
use windows::Win32::System::Com::{
    CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{FOLDERID_Recent, KNOWN_FOLDER_FLAG, SHGetKnownFolderPath};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentDestination {
    pub name: String,
    pub path: String,
}

pub fn recent_destinations(limit: usize) -> Vec<RecentDestination> {
    let mut results = Vec::new();

    unsafe {
        if CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_err() {
            return results;
        }

        let folder = SHGetKnownFolderPath(&FOLDERID_Recent, KNOWN_FOLDER_FLAG(0), None);
        if let Ok(path_ptr) = folder {
            if !path_ptr.0.is_null() {
                if let Ok(directory) = path_ptr.to_string() {
                    let mut entries: Vec<(std::time::SystemTime, RecentDestination)> = Vec::new();
                    if let Ok(read_dir) = std::fs::read_dir(&directory) {
                        for entry in read_dir.flatten() {
                            let path = entry.path();
                            let is_link = path
                                .extension()
                                .and_then(|ext| ext.to_str())
                                .map(|ext| ext.eq_ignore_ascii_case("lnk"))
                                .unwrap_or(false);
                            if !is_link {
                                continue;
                            }
                            let Some(name) =
                                path.file_stem().map(|stem| stem.to_string_lossy().to_string())
                            else {
                                continue;
                            };
                            let modified = entry
                                .metadata()
                                .and_then(|meta| meta.modified())
                                .unwrap_or(std::time::UNIX_EPOCH);
                            entries.push((
                                modified,
                                RecentDestination {
                                    name,
                                    path: path.to_string_lossy().to_string(),
                                },
                            ));
                        }
                    }

                    entries.sort_by(|a, b| b.0.cmp(&a.0));
                    results = entries
                        .into_iter()
                        .take(limit)
                        .map(|(_, entry)| entry)
                        .collect();
                }
                CoTaskMemFree(Some(path_ptr.0 as *const _));
            }
        }

        CoUninitialize();
    }

    results
}

#[allow(dead_code)]
fn _keep_pcwstr_import() {
    let _: Option<PCWSTR> = None;
}
