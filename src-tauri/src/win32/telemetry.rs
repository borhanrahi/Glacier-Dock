//! Local telemetry bus.
//!
//! One sampler thread turns Win32 counters into `TelemetryFrame`s at a fixed
//! interval and broadcasts them as `glacier://telemetry`. Widgets subscribe
//! through `window.glacier.telemetry.subscribe()` instead of polling, and the
//! task manager / flyouts can pull the last frame synchronously with
//! `telemetry_snapshot`.
//!
//! Everything here is a local read of OS counters. Nothing leaves the machine,
//! and no network provider is used.
//!
//! Two values are deliberately `None` rather than invented:
//!   * `gpu_percent` needs the D3DKMT/ETW per-process device counters,
//!   * `temperature_c` needs WMI `MSAcpi_ThermalZoneTemperature` (often absent
//!     on desktops). Widgets render an explicit "unavailable" state for both.

use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProcess {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub ram_mb: f64,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryFrame {
    pub seq: u64,
    pub timestamp_ms: u64,
    pub uptime_secs: u64,
    pub cpu_percent: f32,
    pub cpu_user_percent: f32,
    pub cpu_kernel_percent: f32,
    pub ram_used_mb: f64,
    pub ram_total_mb: f64,
    pub ram_percent: f32,
    pub commit_used_mb: f64,
    pub disk_free_gb: f64,
    pub disk_total_gb: f64,
    pub net_down_bps: f64,
    pub net_up_bps: f64,
    pub battery_percent: Option<f32>,
    pub battery_charging: bool,
    pub battery_seconds_left: Option<u32>,
    pub top_process: Option<TopProcess>,
    pub gpu_percent: Option<f32>,
    pub temperature_c: Option<f32>,
}

struct Sampler {
    at: Instant,
    idle: u64,
    kernel: u64,
    user: u64,
    net_in: u64,
    net_out: u64,
}

static PREVIOUS: Mutex<Option<Sampler>> = Mutex::new(None);
static LATEST: Mutex<Option<TelemetryFrame>> = Mutex::new(None);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Last cached frame, or one immediate sample when the bus is started.
pub fn current(interval_ms: u64) -> TelemetryFrame {
    if let Some(frame) = LATEST.lock().ok().and_then(|guard| guard.clone()) {
        return frame;
    }
    let seq = 0;
    let mut frame = sample(seq, true);
    frame.timestamp_ms = now_ms();
    if let Ok(mut guard) = LATEST.lock() {
        *guard = Some(frame.clone());
    }
    let _ = interval_ms;
    frame
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut seq = 0u64;
        let mut interval_ms = 1_000u64;
        let mut top_process = true;
        let mut network = true;
        let mut ticks = 0u32;

        loop {
            if ticks % 5 == 0 {
                let cfg = crate::config::load(&app);
                if !cfg.telemetry.enabled {
                    std::thread::sleep(Duration::from_millis(1_500));
                    ticks = ticks.wrapping_add(1);
                    continue;
                }
                interval_ms = cfg.telemetry.interval_ms.clamp(250, 10_000) as u64;
                top_process = cfg.telemetry.top_process;
                network = cfg.telemetry.network;
            }
            ticks = ticks.wrapping_add(1);
            seq = seq.wrapping_add(1);

            let mut frame = sample(seq, network);
            frame.timestamp_ms = now_ms();
            if !top_process {
                frame.top_process = None;
            }
            if let Ok(mut guard) = LATEST.lock() {
                *guard = Some(frame.clone());
            }
            let _ = app.emit("glacier://telemetry", &frame);
            std::thread::sleep(Duration::from_millis(interval_ms));
        }
    });
}

fn sample(seq: u64, network: bool) -> TelemetryFrame {
    let mut frame = TelemetryFrame {
        seq,
        timestamp_ms: now_ms(),
        ..TelemetryFrame::default()
    };
    #[cfg(windows)]
    {
        fill_windows(&mut frame, network);
    }
    #[cfg(not(windows))]
    {
        let _ = network;
    }
    frame
}

#[cfg(windows)]
fn fill_windows(frame: &mut TelemetryFrame, network: bool) {
    use windows::Win32::System::Power::GetSystemPowerStatus;
    use windows::Win32::System::SystemInformation::{
        GlobalMemoryStatusEx, GetTickCount64, MEMORYSTATUSEX,
    };
    use windows::Win32::System::Threading::GetSystemTimes;

    // Uptime.
    frame.uptime_secs = unsafe { GetTickCount64() } / 1000;

    // CPU: kernel time includes idle, so busy = (kernel + user) - idle.
    unsafe {
        let mut idle = Default::default();
        let mut kernel = Default::default();
        let mut user = Default::default();
        if GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)).is_ok() {
            let idle = filetime_to_u64(idle);
            let kernel = filetime_to_u64(kernel);
            let user = filetime_to_u64(user);
            let at = Instant::now();

            if let Ok(mut guard) = PREVIOUS.lock() {
                if let Some(prev) = guard.as_ref() {
                    let total = (kernel + user).saturating_sub(prev.kernel + prev.user);
                    let idle_delta = idle.saturating_sub(prev.idle);
                    if total > 0 {
                        frame.cpu_percent =
                            (((total - idle_delta) as f64 / total as f64) * 100.0) as f32;
                        frame.cpu_percent = frame.cpu_percent.clamp(0.0, 100.0);
                        frame.cpu_user_percent = ((user.saturating_sub(prev.user) as f64
                            / total as f64)
                            * 100.0) as f32;
                        frame.cpu_kernel_percent = ((kernel.saturating_sub(prev.kernel) as f64
                            / total as f64)
                            * 100.0) as f32;
                    }
                }
                let sampler = guard.get_or_insert(Sampler {
                    at,
                    idle,
                    kernel,
                    user,
                    net_in: 0,
                    net_out: 0,
                });
                sampler.at = at;
                sampler.idle = idle;
                sampler.kernel = kernel;
                sampler.user = user;
            }
        }
    }

    // Memory.
    unsafe {
        let mut status = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            ..Default::default()
        };
        if GlobalMemoryStatusEx(&mut status).is_ok() {
            let total = status.ullTotalPhys as f64;
            let used = total - status.ullAvailPhys as f64;
            frame.ram_total_mb = round1(total / 1_048_576.0);
            frame.ram_used_mb = round1(used / 1_048_576.0);
            frame.ram_percent =
                ((used / total.max(1.0)) * 100.0).clamp(0.0, 100.0) as f32;
            frame.commit_used_mb = round1(
                (status.ullTotalPageFile.saturating_sub(status.ullAvailPageFile)) as f64
                    / 1_048_576.0,
            );
        }
    }

    // System drive space.
    unsafe {
        use windows::core::w;
        use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
        let mut free = 0u64;
        let mut total = 0u64;
        if GetDiskFreeSpaceExW(w!("C:\\"), None, Some(&mut total), Some(&mut free)).is_ok() {
            frame.disk_free_gb = round1(free as f64 / 1_073_741_824.0);
            frame.disk_total_gb = round1(total as f64 / 1_073_741_824.0);
        }
    }

    // Network throughput from cumulative interface counters.
    let (net_in, net_out) = if network { interface_counters() } else { (0, 0) };
    if let Ok(mut guard) = PREVIOUS.lock() {
        if let Some(prev) = guard.as_ref() {
            if prev.net_in > 0 || prev.net_out > 0 {
                let secs = prev.at.elapsed().as_secs_f64().max(0.05);
                frame.net_down_bps =
                    (net_in.saturating_sub(prev.net_in) as f64 / secs).max(0.0);
                frame.net_up_bps =
                    (net_out.saturating_sub(prev.net_out) as f64 / secs).max(0.0);
            }
        }
        if let Some(sampler) = guard.as_mut() {
            sampler.net_in = net_in;
            sampler.net_out = net_out;
        }
    }

    // Battery.
    unsafe {
        use windows::Win32::System::Power::SYSTEM_POWER_STATUS;
        let mut status = SYSTEM_POWER_STATUS::default();
        if GetSystemPowerStatus(&mut status).is_ok() {
            if status.BatteryLifePercent != 255 {
                frame.battery_percent = Some(status.BatteryLifePercent as f32);
            }
            frame.battery_charging = status.ACLineStatus == 1;
            if status.BatteryLifeTime != u32::MAX {
                frame.battery_seconds_left = Some(status.BatteryLifeTime);
            }
        }
    }

    // Top process by CPU (cheap: process_manager keeps its own delta cache).
    if let Some(row) = super::process_manager::snapshot()
        .processes
        .iter()
        .max_by(|a, b| a.cpu_percent.total_cmp(&b.cpu_percent))
    {
        frame.top_process = Some(TopProcess {
            pid: row.pid,
            name: row.name.clone(),
            cpu_percent: row.cpu_percent,
            ram_mb: round1(row.ram_bytes as f64 / 1_048_576.0),
        });
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceInfo {
    pub alias: String,
    pub description: String,
    pub up: bool,
    pub loopback: bool,
    pub kind: String,
    pub speed_bps: u64,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

/// Physical/virtual adapters with cumulative counters (for bandwidth widgets).
pub fn interfaces() -> Vec<InterfaceInfo> {
    #[cfg(windows)]
    {
        use windows::Win32::NetworkManagement::IpHelper::{
            FreeMibTable, GetIfTable2, MIB_IF_TABLE2, IF_TYPE_ETHERNET_CSMACD,
            IF_TYPE_IEEE80211, IF_TYPE_SOFTWARE_LOOPBACK,
        };
        use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;

        fn wide_to_string(buffer: &[u16]) -> String {
            let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
            String::from_utf16_lossy(&buffer[..end])
        }

        let mut out = Vec::new();
        let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
        unsafe {
            if GetIfTable2(&mut table).is_ok() && !table.is_null() {
                let rows = std::slice::from_raw_parts(
                    (*table).Table.as_ptr(),
                    (*table).NumEntries as usize,
                );
                for row in rows {
                    out.push(InterfaceInfo {
                        alias: wide_to_string(&row.Alias),
                        description: wide_to_string(&row.Description),
                        up: row.OperStatus == IfOperStatusUp,
                        loopback: row.Type == IF_TYPE_SOFTWARE_LOOPBACK,
                        kind: match row.Type {
                            IF_TYPE_IEEE80211 => "wifi",
                            IF_TYPE_ETHERNET_CSMACD => "ethernet",
                            IF_TYPE_SOFTWARE_LOOPBACK => "loopback",
                            _ => "other",
                        }
                        .into(),
                        speed_bps: row.ReceiveLinkSpeed,
                        rx_bytes: row.InOctets,
                        tx_bytes: row.OutOctets,
                    });
                }
                FreeMibTable(table as *const _);
            }
        }
        out.sort_by(|a, b| b.up.cmp(&a.up).then(a.alias.cmp(&b.alias)));
        out
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn filetime_to_u64(time: windows::Win32::Foundation::FILETIME) -> u64 {
    ((time.dwHighDateTime as u64) << 32) | time.dwLowDateTime as u64
}

#[cfg(windows)]
fn interface_counters() -> (u64, u64) {
    use windows::Win32::NetworkManagement::IpHelper::{
        FreeMibTable, GetIfTable2, MIB_IF_TABLE2, IF_TYPE_SOFTWARE_LOOPBACK,
    };
    use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;

    let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
    let mut total_in = 0u64;
    let mut total_out = 0u64;
    unsafe {
        if GetIfTable2(&mut table).is_ok() && !table.is_null() {
            let rows = std::slice::from_raw_parts(
                (*table).Table.as_ptr(),
                (*table).NumEntries as usize,
            );
            for row in rows {
                if row.OperStatus == IfOperStatusUp
                    && row.Type != IF_TYPE_SOFTWARE_LOOPBACK
                    && row.InOctets > 0
                {
                    total_in = total_in.saturating_add(row.InOctets);
                    total_out = total_out.saturating_add(row.OutOctets);
                }
            }
            FreeMibTable(table as *const _);
        }
    }
    (total_in, total_out)
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
