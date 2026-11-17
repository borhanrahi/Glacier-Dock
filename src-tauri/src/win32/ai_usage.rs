//! Read-only AI plan quota snapshots for locally signed-in AI clients
//! (Claude Code, Codex, Antigravity, Gemini CLI) using WinHTTP.

use serde::Serialize;
use serde_json::Value;
use std::{env, fs, path::PathBuf};
use windows::core::PCWSTR;
use windows::Win32::Networking::WinHttp::{
    WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryHeaders,
    WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest, WinHttpSetTimeouts,
    WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE, WINHTTP_OPEN_REQUEST_FLAGS,
    WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQuotaWindow {
    pub label: String,
    pub used_percent: u8,
    pub resets_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderUsage {
    pub id: String,
    pub name: String,
    pub state: String, // "ready" | "sign_in" | "unavailable"
    pub windows: Vec<AiQuotaWindow>,
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn http_request(
    method: &str,
    url: &str,
    headers: &[(&str, &str)],
    body: Option<&str>,
) -> Result<(u32, String), String> {
    let (scheme, rest) = url
        .split_once("://")
        .ok_or_else(|| "url is missing a scheme".to_string())?;
    let secure = scheme.eq_ignore_ascii_case("https");
    let (authority, path) = match rest.split_once('/') {
        Some((authority, path)) => (authority, format!("/{path}")),
        None => (rest, "/".to_string()),
    };
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => (
            host,
            port.parse::<u16>().unwrap_or(if secure { 443 } else { 80 }),
        ),
        None => (authority, if secure { 443 } else { 80 }),
    };

    let agent = wide("GlacierDock/1.0");
    let host_w = wide(host);
    let path_w = wide(&path);
    let method_w = wide(method);
    let header_block: String = headers
        .iter()
        .map(|(k, v)| format!("{k}: {v}\r\n"))
        .collect();
    let header_w = wide(&header_block);

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
        let _ = WinHttpSetTimeouts(session, 1_200, 1_200, 1_200, 1_500);

        let result = (|| -> Result<(u32, String), String> {
            let connection = WinHttpConnect(session, PCWSTR(host_w.as_ptr()), port, 0);
            if connection.is_null() {
                return Err("connect failed".into());
            }
            let mut flags = WINHTTP_OPEN_REQUEST_FLAGS(0);
            if secure {
                flags |= WINHTTP_FLAG_SECURE;
            }
            let request = WinHttpOpenRequest(
                connection,
                PCWSTR(method_w.as_ptr()),
                PCWSTR(path_w.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                std::ptr::null(),
                flags,
            );
            if request.is_null() {
                let _ = WinHttpCloseHandle(connection);
                return Err("open request failed".into());
            }

            let outcome = (|| -> Result<(u32, String), String> {
                let header_slice = if headers.is_empty() {
                    None
                } else {
                    Some(&header_w[..header_w.len() - 1])
                };
                let body_bytes = body.map(|b| b.as_bytes()).unwrap_or(&[]);
                WinHttpSendRequest(
                    request,
                    header_slice,
                    if body_bytes.is_empty() {
                        None
                    } else {
                        Some(body_bytes.as_ptr() as *const _)
                    },
                    body_bytes.len() as u32,
                    body_bytes.len() as u32,
                    0,
                )
                .map_err(|e| e.to_string())?;
                WinHttpReceiveResponse(request, std::ptr::null_mut())
                    .map_err(|e| e.to_string())?;

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

                let mut out = Vec::new();
                let mut buf = vec![0u8; 8192];
                loop {
                    let mut read = 0u32;
                    WinHttpReadData(
                        request,
                        buf.as_mut_ptr() as *mut _,
                        buf.len() as u32,
                        &mut read,
                    )
                    .map_err(|e| e.to_string())?;
                    if read == 0 {
                        break;
                    }
                    out.extend_from_slice(&buf[..read as usize]);
                    if out.len() > 512 * 1024 {
                        break;
                    }
                }
                let text = String::from_utf8_lossy(&out).into_owned();
                Ok((status, text))
            })();

            let _ = WinHttpCloseHandle(request);
            let _ = WinHttpCloseHandle(connection);
            outcome
        })();

        let _ = WinHttpCloseHandle(session);
        result
    }
}

fn clamp_pct(v: f64) -> u8 {
    v.round().clamp(0.0, 100.0) as u8
}

fn fetch_claude() -> AiProviderUsage {
    let base = |state: &str| AiProviderUsage {
        id: "claude".into(),
        name: "Claude Code".into(),
        state: state.into(),
        windows: Vec::new(),
    };

    let Some(root) = env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|p| p.join(".claude")))
    else {
        return base("sign_in");
    };
    let Ok(bytes) = fs::read(root.join(".credentials.json")) else {
        return base("sign_in");
    };
    let Ok(creds) = serde_json::from_slice::<Value>(&bytes) else {
        return base("unavailable");
    };
    let Some(token) = creds
        .pointer("/claudeAiOauth/accessToken")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    else {
        return base("sign_in");
    };

    let auth = format!("Bearer {token}");
    let Ok((status, text)) = http_request(
        "GET",
        "https://api.anthropic.com/api/oauth/usage",
        &[
            ("Authorization", &auth),
            ("anthropic-beta", "oauth-2025-04-20"),
        ],
        None,
    ) else {
        return base("unavailable");
    };

    if status == 401 || status == 403 {
        return base("sign_in");
    }
    if status != 200 {
        return base("unavailable");
    }
    let Ok(val) = serde_json::from_str::<Value>(&text) else {
        return base("unavailable");
    };

    let mut windows = Vec::new();
    for (key, label) in [("five_hour", "5 h"), ("seven_day", "7 d")] {
        if let Some(obj) = val.get(key) {
            if let Some(util) = obj.get("utilization").and_then(Value::as_f64) {
                let resets_at = obj
                    .get("resets_at")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                windows.push(AiQuotaWindow {
                    label: label.into(),
                    used_percent: clamp_pct(util),
                    resets_at,
                });
            }
        }
    }

    AiProviderUsage {
        id: "claude".into(),
        name: "Claude Code".into(),
        state: if windows.is_empty() {
            "unavailable".into()
        } else {
            "ready".into()
        },
        windows,
    }
}

fn fetch_codex() -> AiProviderUsage {
    let base = |state: &str| AiProviderUsage {
        id: "codex".into(),
        name: "Codex".into(),
        state: state.into(),
        windows: Vec::new(),
    };

    let Some(root) = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|p| p.join(".codex")))
    else {
        return base("sign_in");
    };
    let Ok(bytes) = fs::read(root.join("auth.json")) else {
        return base("sign_in");
    };
    let Ok(creds) = serde_json::from_slice::<Value>(&bytes) else {
        return base("unavailable");
    };
    let Some(token) = creds
        .pointer("/tokens/access_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    else {
        return base("sign_in");
    };

    let auth = format!("Bearer {token}");
    let mut headers = vec![("Authorization", auth.as_str())];
    let account = creds
        .pointer("/tokens/account_id")
        .and_then(Value::as_str)
        .unwrap_or("");
    if !account.is_empty() {
        headers.push(("ChatGPT-Account-ID", account));
    }

    let Ok((status, text)) = http_request(
        "GET",
        "https://chatgpt.com/backend-api/wham/usage",
        &headers,
        None,
    ) else {
        return base("unavailable");
    };

    if status == 401 || status == 403 {
        return base("sign_in");
    }
    if status != 200 {
        return base("unavailable");
    }
    let Ok(val) = serde_json::from_str::<Value>(&text) else {
        return base("unavailable");
    };

    let mut windows = Vec::new();
    for (key, fallback_label) in [
        ("/rate_limit/primary_window", "5 h"),
        ("/rate_limit/secondary_window", "7 d"),
    ] {
        if let Some(obj) = val.pointer(key) {
            if let Some(used) = obj.get("used_percent").and_then(Value::as_f64) {
                let mins = obj
                    .get("limit_window_seconds")
                    .and_then(Value::as_i64)
                    .unwrap_or(0)
                    / 60;
                let label = if mins >= 2 * 24 * 60 {
                    "7 d".to_string()
                } else if mins >= 60 {
                    format!("{} h", mins / 60)
                } else {
                    fallback_label.to_string()
                };
                windows.push(AiQuotaWindow {
                    label,
                    used_percent: clamp_pct(used),
                    resets_at: None,
                });
            }
        }
    }

    AiProviderUsage {
        id: "codex".into(),
        name: "Codex".into(),
        state: if windows.is_empty() {
            "unavailable".into()
        } else {
            "ready".into()
        },
        windows,
    }
}

fn fetch_gemini() -> AiProviderUsage {
    let base = |state: &str| AiProviderUsage {
        id: "gemini".into(),
        name: "Gemini / Antigravity".into(),
        state: state.into(),
        windows: Vec::new(),
    };

    if let Some(antigravity) = fetch_antigravity() {
        return antigravity;
    }

    let Some(path) = home_dir().map(|p| p.join(".gemini/oauth_creds.json")) else {
        return base("sign_in");
    };
    let Ok(bytes) = fs::read(path) else {
        return base("sign_in");
    };
    let Ok(auth) = serde_json::from_slice::<Value>(&bytes) else {
        return base("unavailable");
    };
    let Some(token) = auth
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    else {
        return base("sign_in");
    };

    let bearer = format!("Bearer {token}");
    let Ok((status, text)) = http_request(
        "POST",
        "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
        &[
            ("Authorization", &bearer),
            ("Content-Type", "application/json"),
        ],
        Some("{}"),
    ) else {
        return base("unavailable");
    };

    if status == 401 || status == 403 {
        return base("sign_in");
    }
    if status != 200 {
        return base("unavailable");
    }
    let Ok(val) = serde_json::from_str::<Value>(&text) else {
        return base("unavailable");
    };

    let mut pro_used: Option<u8> = None;
    let mut flash_used: Option<u8> = None;
    if let Some(buckets) = val.get("buckets").and_then(Value::as_array) {
        for bucket in buckets {
            let model = bucket
                .get("modelId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            let remaining = bucket
                .get("remainingFraction")
                .and_then(Value::as_f64)
                .unwrap_or(1.0);
            let used = clamp_pct((1.0 - remaining) * 100.0);
            if model.contains("pro") {
                pro_used = Some(pro_used.map_or(used, |prev| prev.max(used)));
            } else if model.contains("flash") {
                flash_used = Some(flash_used.map_or(used, |prev| prev.max(used)));
            }
        }
    }

    let mut windows = Vec::new();
    if let Some(u) = pro_used {
        windows.push(AiQuotaWindow {
            label: "Pro".into(),
            used_percent: u,
            resets_at: None,
        });
    }
    if let Some(u) = flash_used {
        windows.push(AiQuotaWindow {
            label: "Flash".into(),
            used_percent: u,
            resets_at: None,
        });
    }

    AiProviderUsage {
        id: "gemini".into(),
        name: "Gemini CLI".into(),
        state: if windows.is_empty() {
            "unavailable".into()
        } else {
            "ready".into()
        },
        windows,
    }
}

fn fetch_antigravity() -> Option<AiProviderUsage> {
    let daemon = home_dir()?.join(".gemini/antigravity/daemon");
    let entries = fs::read_dir(daemon).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else {
            continue;
        };
        if !(name_str.starts_with("hub_") && name_str.ends_with(".json")) {
            continue;
        }
        let Ok(bytes) = fs::read(entry.path()) else {
            continue;
        };
        let Ok(info) = serde_json::from_slice::<Value>(&bytes) else {
            continue;
        };
        let Some(csrf) = info.get("csrfToken").and_then(Value::as_str) else {
            continue;
        };
        let Some(port) = info.get("httpPort").and_then(Value::as_u64) else {
            continue;
        };
        let url = format!(
            "http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary"
        );
        let Ok((status, text)) = http_request(
            "POST",
            &url,
            &[
                ("Content-Type", "application/json"),
                ("Connect-Protocol-Version", "1"),
                ("x-codeium-csrf-token", csrf),
            ],
            Some("{}"),
        ) else {
            continue;
        };
        if status != 200 {
            continue;
        }
        let Ok(val) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let mut windows = Vec::new();
        if let Some(configs) = val
            .pointer("/userStatus/cascadeModelConfigData/clientModelConfigs")
            .and_then(Value::as_array)
        {
            let mut pro_used: Option<u8> = None;
            let mut flash_used: Option<u8> = None;
            for cfg in configs {
                let label = cfg
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if let Some(rem) = cfg.pointer("/quotaInfo/remainingFraction").and_then(Value::as_f64)
                {
                    let used = clamp_pct((1.0 - rem) * 100.0);
                    if label.contains("pro") || label.contains("claude") {
                        pro_used = Some(pro_used.map_or(used, |p| p.max(used)));
                    } else if label.contains("flash") {
                        flash_used = Some(flash_used.map_or(used, |p| p.max(used)));
                    }
                }
            }
            if let Some(u) = pro_used {
                windows.push(AiQuotaWindow {
                    label: "Pro".into(),
                    used_percent: u,
                    resets_at: None,
                });
            }
            if let Some(u) = flash_used {
                windows.push(AiQuotaWindow {
                    label: "Flash".into(),
                    used_percent: u,
                    resets_at: None,
                });
            }
        }
        if !windows.is_empty() {
            return Some(AiProviderUsage {
                id: "antigravity".into(),
                name: "Antigravity".into(),
                state: "ready".into(),
                windows,
            });
        }
    }
    None
}

fn fetch_opencode() -> AiProviderUsage {
    let base = |state: &str| AiProviderUsage {
        id: "opencode".into(),
        name: "OpenCode Go".into(),
        state: state.into(),
        windows: Vec::new(),
    };

    let token = env::var("OPENCODE_API_KEY").ok().or_else(|| {
        let path = home_dir()?.join(".local/share/opencode/auth.json");
        let bytes = fs::read(path).ok()?;
        let auth: Value = serde_json::from_slice(&bytes).ok()?;
        auth.pointer("/opencode/key")
            .and_then(Value::as_str)
            .map(str::to_owned)
    });
    let Some(token) = token.filter(|t| !t.is_empty()) else {
        return base("sign_in");
    };

    let auth = format!("Bearer {token}");
    let Ok((status, text)) = http_request(
        "GET",
        "https://opencode.ai/zen/go/v1/usage",
        &[("Authorization", &auth), ("Accept", "application/json")],
        None,
    ) else {
        return base("unavailable");
    };
    if status == 401 || status == 403 {
        return base("sign_in");
    }
    if status != 200 {
        return base("unavailable");
    }
    let Ok(val) = serde_json::from_str::<Value>(&text) else {
        return base("unavailable");
    };
    let Some(usage) = val.get("usage") else {
        return base("unavailable");
    };

    let mut windows = Vec::new();
    for (key, label) in [("rolling", "5 h"), ("weekly", "7 d"), ("monthly", "30 d")] {
        if let Some(lane) = usage.get(key) {
            let pct = lane.get("percent").and_then(Value::as_f64).or_else(|| {
                let used = lane.get("used")?.as_f64()?;
                let limit = lane.get("limit")?.as_f64()?;
                (limit > 0.0).then(|| (used * 100.0) / limit)
            });
            if let Some(p) = pct {
                windows.push(AiQuotaWindow {
                    label: label.into(),
                    used_percent: clamp_pct(p),
                    resets_at: None,
                });
            }
        }
    }

    AiProviderUsage {
        id: "opencode".into(),
        name: "OpenCode Go".into(),
        state: if windows.is_empty() {
            "unavailable".into()
        } else {
            "ready".into()
        },
        windows,
    }
}

pub fn snapshot() -> Vec<AiProviderUsage> {
    std::thread::scope(|scope| {
        let claude = scope.spawn(fetch_claude);
        let codex = scope.spawn(fetch_codex);
        let opencode = scope.spawn(fetch_opencode);
        let gemini = scope.spawn(fetch_gemini);
        [claude, codex, opencode, gemini]
            .into_iter()
            .filter_map(|handle| handle.join().ok())
            .collect()
    })
}
