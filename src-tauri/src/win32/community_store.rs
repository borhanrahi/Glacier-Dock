//! One-click community widget store.
//!
//! A widget package is a single JSON manifest (`<id>.widget.json`):
//!
//! ```json
//! {
//!   "id": "cpu-monitor",
//!   "name": "CPU Monitor",
//!   "category": "system",
//!   "version": "1.0.0",
//!   "author": "Glacier Dock",
//!   "description": "Live per-core CPU usage.",
//!   "bundled": true
//! }
//! ```
//!
//! Bundled widgets ship with the app and only need their manifest written to
//! the widget directory to be "installed". Community widgets carry a
//! `manifestUrl` field; the installer downloads it over WinHTTP and validates
//! it before writing. No archive handling, no code execution from the store:
//! a package only selects a component the app already compiled in, or declares
//! a remote JSON feed a widget renders.
//!
//! Everything is stored under `%APPDATA%\GlacierDock\widgets`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::config;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct WidgetPackage {
    pub id: String,
    pub name: String,
    pub category: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub bundled: bool,
    /// Remote feed the widget may read (community widgets only).
    pub feed: Option<String>,
    /// Raw manifest URL used for 1-click installs.
    pub manifest_url: Option<String>,
    pub installed_at_ms: u64,
}

pub fn widgets_dir() -> PathBuf {
    config::data_dir().join("widgets")
}

fn manifest_path(id: &str) -> PathBuf {
    widgets_dir().join(format!("{id}.widget.json"))
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Every installed package, sorted by category then name.
pub fn installed() -> Vec<WidgetPackage> {
    let Ok(entries) = std::fs::read_dir(widgets_dir()) else {
        return Vec::new();
    };
    let mut out: Vec<WidgetPackage> = entries
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .ends_with(".widget.json")
        })
        .filter_map(|entry| std::fs::read_to_string(entry.path()).ok())
        .filter_map(|text| serde_json::from_str::<WidgetPackage>(&text).ok())
        .collect();
    out.sort_by(|a, b| a.category.cmp(&b.category).then(a.name.cmp(&b.name)));
    out
}

pub fn install(package: WidgetPackage) -> Result<WidgetPackage, String> {
    if !valid_id(&package.id) {
        return Err("invalid widget id".into());
    }
    let mut package = package;
    if package.version.trim().is_empty() {
        package.version = "1.0.0".into();
    }
    if package.installed_at_ms == 0 {
        package.installed_at_ms = now_ms();
    }
    std::fs::create_dir_all(widgets_dir()).map_err(|err| err.to_string())?;
    let text = serde_json::to_string_pretty(&package).map_err(|err| err.to_string())?;
    std::fs::write(manifest_path(&package.id), text).map_err(|err| err.to_string())?;
    Ok(package)
}

pub fn uninstall(id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid widget id".into());
    }
    let path = manifest_path(id);
    if path.exists() {
        std::fs::remove_file(path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

/// Cached community index (`index.json`), refreshed on demand.
pub fn index() -> serde_json::Value {
    let path = widgets_dir().join("index.json");
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!([])),
        Err(_) => serde_json::json!([]),
    }
}

pub fn refresh_index(url: &str) -> Result<serde_json::Value, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("store url must be http(s)".into());
    }
    let body = http_get(url)?;
    let parsed: serde_json::Value =
        serde_json::from_str(&body).map_err(|err| format!("invalid store index: {err}"))?;
    if !parsed.is_array() {
        return Err("store index must be a JSON array".into());
    }
    std::fs::create_dir_all(widgets_dir()).map_err(|err| err.to_string())?;
    let _ = std::fs::write(
        widgets_dir().join("index.json"),
        serde_json::to_string_pretty(&parsed).unwrap_or_default(),
    );
    Ok(parsed)
}

/// 1-click install from a manifest URL.
pub fn install_from_url(url: &str) -> Result<WidgetPackage, String> {
    let body = http_get(url)?;
    let mut package: WidgetPackage =
        serde_json::from_str(&body).map_err(|err| format!("invalid manifest: {err}"))?;
    package.bundled = false;
    package.manifest_url = Some(url.to_string());
    install(package)
}

/// Per-widget key/value storage: `%APPDATA%\GlacierDock\widgets\<id>.storage.json`.
pub fn storage_read(id: &str) -> serde_json::Value {
    if !valid_id(id) {
        return serde_json::json!({});
    }
    let path = widgets_dir().join(format!("{id}.storage.json"));
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({})),
        Err(_) => serde_json::json!({}),
    }
}

pub fn storage_write(id: &str, value: serde_json::Value) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid widget id".into());
    }
    std::fs::create_dir_all(widgets_dir()).map_err(|err| err.to_string())?;
    let text = serde_json::to_string_pretty(&value).map_err(|err| err.to_string())?;
    std::fs::write(widgets_dir().join(format!("{id}.storage.json")), text)
        .map_err(|err| err.to_string())
}

/// Public GET used by feed widgets (weather, FX, GitHub, …). Same WinHTTP path
/// as the store, so TLS trust and proxies come from the OS.
pub fn fetch(url: &str) -> Result<String, String> {
    http_get(url)
}

/// Minimal WinHTTP GET. HTTPS is terminated by WinHTTP, so the redirect chain
/// and TLS trust store are the OS ones.
#[cfg(windows)]
fn http_get(url: &str) -> Result<String, String> {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Networking::WinHttp::{
        WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest,
        WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest,
        WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE,
        WINHTTP_OPEN_REQUEST_FLAGS, WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let (scheme, rest) = url
        .split_once("://")
        .ok_or_else(|| "url is missing a scheme".to_string())?;
    let secure = scheme.eq_ignore_ascii_case("https");
    let (authority, path) = match rest.split_once('/') {
        Some((authority, path)) => (authority, format!("/{path}")),
        None => (rest, "/".to_string()),
    };
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => (host, port.parse::<u16>().unwrap_or(if secure { 443 } else { 80 })),
        None => (authority, if secure { 443 } else { 80 }),
    };
    if host.is_empty() {
        return Err("url is missing a host".into());
    }

    let agent = wide("GlacierDock/1.0");
    let host_w = wide(host);
    let path_w = wide(&path);

    unsafe {
        let session = WinHttpOpen(
            PCWSTR(agent.as_ptr()),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            PCWSTR::null(),
            PCWSTR::null(),
            0,
        );
        if session.is_null() {
            return Err("WinHttpOpen failed".into());
        }
        let _ = WinHttpSetTimeouts(session, 8_000, 8_000, 8_000, 12_000);

        let result = (|| -> Result<String, String> {
            let connection = WinHttpConnect(session, PCWSTR(host_w.as_ptr()), port, 0);
            if connection.is_null() {
                return Err(format!("could not connect to {host}"));
            }
            let mut flags = WINHTTP_OPEN_REQUEST_FLAGS(0);
            if secure {
                flags |= WINHTTP_FLAG_SECURE;
            }
            let request = WinHttpOpenRequest(
                connection,
                PCWSTR::null(), // GET
                PCWSTR(path_w.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                std::ptr::null(),
                flags,
            );
            if request.is_null() {
                let _ = WinHttpCloseHandle(connection);
                return Err("WinHttpOpenRequest failed".into());
            }

            let outcome = (|| -> Result<String, String> {
                WinHttpSendRequest(request, None, None, 0, 0, 0)
                    .map_err(|err| err.to_string())?;
                WinHttpReceiveResponse(request, std::ptr::null_mut())
                    .map_err(|err| err.to_string())?;

                let mut status: u32 = 0;
                let mut len = std::mem::size_of::<u32>() as u32;
                let _ = WinHttpQueryHeaders(
                    request,
                    WINHTTP_QUERY_FLAG_NUMBER | WINHTTP_QUERY_STATUS_CODE,
                    PCWSTR::null(),
                    Some(&mut status as *mut u32 as *mut _),
                    &mut len,
                    std::ptr::null_mut(),
                );
                if status != 200 {
                    return Err(format!("store returned HTTP {status}"));
                }

                let mut body: Vec<u8> = Vec::new();
                let mut buffer = vec![0u8; 16 * 1024];
                loop {
                    let mut read = 0u32;
                    WinHttpReadData(
                        request,
                        buffer.as_mut_ptr() as *mut _,
                        buffer.len() as u32,
                        &mut read,
                    )
                    .map_err(|err| err.to_string())?;
                    if read == 0 {
                        break;
                    }
                    body.extend_from_slice(&buffer[..read as usize]);
                    if body.len() > 2 * 1024 * 1024 {
                        return Err("store payload is larger than 2 MiB".into());
                    }
                }
                String::from_utf8(body).map_err(|_| "store payload is not UTF-8".into())
            })();

            let _ = WinHttpCloseHandle(request);
            let _ = WinHttpCloseHandle(connection);
            outcome
        })();

        let _ = WinHttpCloseHandle(session);
        let _ = PWSTR::null();
        result
    }
}

#[cfg(not(windows))]
fn http_get(url: &str) -> Result<String, String> {
    let _ = url;
    Err("the community store is only available on Windows".into())
}
