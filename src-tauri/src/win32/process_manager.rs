//! Glacier Activity Monitor backend.
//!
//! Process enumeration and control (kill / force kill / tree / suspend / reveal),
//! memory counters, and localhost listening-port discovery with port owner PIDs.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use windows::core::{w, PCSTR};
use windows::Win32::Foundation::{CloseHandle, FILETIME, HANDLE};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Threading::{
    GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRow {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub ram_bytes: u64,
    pub impact: &'static str,
    pub exe_path: Option<String>,
    pub suspended: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSnapshot {
    pub processes: Vec<ProcessRow>,
    pub total_ram: u64,
    pub used_ram: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortEntry {
    pub port: u16,
    pub address: String,
    pub pid: u32,
    pub process: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupEntry {
    pub name: String,
    pub path: String,
    pub scope: String,
}

#[derive(Clone, Copy)]
struct Sample {
    cpu_100ns: u64,
    at: Instant,
}

static SAMPLES: Mutex<Vec<(u32, Sample)>> = Mutex::new(Vec::new());
static SUSPENDED: Mutex<Vec<u32>> = Mutex::new(Vec::new());

fn filetime_ticks(value: FILETIME) -> u64 {
    ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
}

fn wide_to_string(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

fn process_name_image(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);
        if result.is_err() {
            return None;
        }
        Some(String::from_utf16_lossy(&buffer[..size as usize]))
    }
}

/// Executable file name for a PID (e.g. `chrome.exe`).
pub fn image_name(pid: u32) -> Option<String> {
    let path = process_name_image(pid)?;
    path.rsplit(['\\', '/']).next().map(|name| name.to_string())
}

/// PID that owns a window handle.
pub fn pid_for_hwnd(raw_hwnd: isize) -> u32 {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(HWND(raw_hwnd as *mut _), Some(&mut pid));
    }
    pid
}

fn process_cpu_time(pid: u32) -> Option<u64> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut creation = FILETIME::default();
        let mut exit = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        let result = GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
        let _ = CloseHandle(handle);
        if result.is_err() {
            return None;
        }
        Some(filetime_ticks(kernel) + filetime_ticks(user))
    }
}

fn process_ram(pid: u32) -> u64 {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return 0;
        };
        let mut counters = PROCESS_MEMORY_COUNTERS::default();
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        let result = GetProcessMemoryInfo(handle, &mut counters, counters.cb);
        let _ = CloseHandle(handle);
        if result.is_err() {
            0
        } else {
            counters.WorkingSetSize as u64
        }
    }
}

fn memory_totals() -> (u64, u64) {
    unsafe {
        let mut status = MEMORYSTATUSEX::default();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut status).is_ok() {
            (status.ullTotalPhys, status.ullTotalPhys - status.ullAvailPhys)
        } else {
            (0, 0)
        }
    }
}

fn impact(cpu: f32, ram: u64) -> &'static str {
    if cpu > 25.0 || ram > 1_500_000_000 {
        "High"
    } else if cpu > 5.0 || ram > 400_000_000 {
        "Moderate"
    } else {
        "Low"
    }
}

fn enumerate_raw() -> Vec<(u32, u32, String)> {
    let mut rows = Vec::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return rows;
        };
        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                rows.push((
                    entry.th32ProcessID,
                    entry.th32ParentProcessID,
                    wide_to_string(&entry.szExeFile),
                ));
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    rows
}

/// Full snapshot with per-process CPU deltas since the previous call.
pub fn snapshot() -> ProcessSnapshot {
    let raw = enumerate_raw();
    let now = Instant::now();
    let cores = std::thread::available_parallelism()
        .map(|value| value.get() as f32)
        .unwrap_or(1.0);

    let suspended = SUSPENDED.lock().map(|list| list.clone()).unwrap_or_default();
    let mut previous: HashMap<u32, Sample> = SAMPLES
        .lock()
        .map(|list| list.iter().map(|(pid, sample)| (*pid, *sample)).collect())
        .unwrap_or_default();
    let mut next_samples = Vec::with_capacity(raw.len());
    let mut rows = Vec::with_capacity(raw.len());

    for (pid, parent_pid, name) in raw {
        let cpu_ticks = process_cpu_time(pid).unwrap_or(0);
        let mut cpu_percent = 0.0;
        if let Some(sample) = previous.remove(&pid) {
            let elapsed = now.duration_since(sample.at).as_secs_f64().max(0.001);
            let delta = cpu_ticks.saturating_sub(sample.cpu_100ns) as f64;
            // 100ns ticks -> percent of one core, scaled by core count.
            cpu_percent = (delta / (elapsed * 10_000_000.0) * 100.0 / cores as f64) as f32;
            cpu_percent = cpu_percent.clamp(0.0, 100.0);
        }
        next_samples.push((
            pid,
            Sample {
                cpu_100ns: cpu_ticks,
                at: now,
            },
        ));

        let ram = process_ram(pid);
        rows.push(ProcessRow {
            pid,
            parent_pid,
            name,
            cpu_percent,
            ram_bytes: ram,
            impact: impact(cpu_percent, ram),
            exe_path: process_name_image(pid),
            suspended: suspended.contains(&pid),
        });
    }

    if let Ok(mut store) = SAMPLES.lock() {
        *store = next_samples;
    }

    rows.sort_by(|a, b| b.cpu_percent.total_cmp(&a.cpu_percent));
    let (total_ram, used_ram) = memory_totals();
    ProcessSnapshot {
        processes: rows,
        total_ram,
        used_ram,
    }
}

fn kill_pid(pid: u32) -> Result<(), String> {
    unsafe {
        let handle =
            OpenProcess(PROCESS_TERMINATE, false, pid).map_err(|e| format!("open {pid}: {e}"))?;
        let result = TerminateProcess(handle, 1).map_err(|e| format!("kill {pid}: {e}"));
        let _ = CloseHandle(handle);
        result
    }
}

fn descendants(pid: u32, rows: &[(u32, u32, String)]) -> Vec<u32> {
    let mut found = Vec::new();
    let mut queue = vec![pid];
    while let Some(current) = queue.pop() {
        for (child, parent, _) in rows {
            if *parent == current && !found.contains(child) {
                found.push(*child);
                queue.push(*child);
            }
        }
    }
    found
}

pub fn kill(pid: u32, tree: bool) -> Result<(), String> {
    if tree {
        let raw = enumerate_raw();
        let mut targets = descendants(pid, &raw);
        targets.reverse();
        for child in targets {
            let _ = kill_pid(child);
        }
    }
    kill_pid(pid)
}

type NtProcessCall = unsafe extern "system" fn(HANDLE) -> i32;

unsafe fn ntdll_proc(name: &[u8]) -> Option<NtProcessCall> {
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    let module = GetModuleHandleW(w!("ntdll.dll")).ok()?;
    let address = GetProcAddress(module, PCSTR(name.as_ptr()))?;
    Some(std::mem::transmute::<_, NtProcessCall>(address))
}

pub fn set_suspended(pid: u32, suspend: bool) -> Result<(), String> {
    unsafe {
        let call = if suspend {
            ntdll_proc(b"NtSuspendProcess\0")
        } else {
            ntdll_proc(b"NtResumeProcess\0")
        };
        let Some(call) = call else {
            return Err("NtSuspendProcess is unavailable".into());
        };
        let handle =
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).map_err(|e| e.to_string())?;
        let status = call(handle);
        let _ = CloseHandle(handle);
        if status < 0 {
            return Err(format!("NTSTATUS 0x{:X}", status));
        }
    }
    if let Ok(mut list) = SUSPENDED.lock() {
        if suspend {
            if !list.contains(&pid) {
                list.push(pid);
            }
        } else {
            list.retain(|entry| *entry != pid);
        }
    }
    Ok(())
}

pub fn reveal(pid: u32) -> Result<(), String> {
    let path = process_name_image(pid).ok_or("process path unavailable")?;
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{path}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Listening TCP ports with their owning PIDs.
pub fn listening_ports() -> Vec<PortEntry> {
    let mut size: u32 = 0;
    unsafe {
        let _ = GetExtendedTcpTable(
            None,
            &mut size,
            false,
            2, // AF_INET
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        );
    }
    if size == 0 {
        return Vec::new();
    }

    let mut buffer = vec![0u8; size as usize];
    let result = unsafe {
        GetExtendedTcpTable(
            Some(buffer.as_mut_ptr() as *mut _),
            &mut size,
            false,
            2,
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        )
    };
    if result != 0 {
        return Vec::new();
    }

    let names: HashMap<u32, String> = enumerate_raw()
        .into_iter()
        .map(|(pid, _, name)| (pid, name))
        .collect();

    let mut ports = Vec::new();
    unsafe {
        #[repr(C)]
        struct TableHeader {
            count: u32,
        }
        let header = &*(buffer.as_ptr() as *const TableHeader);
        let rows = buffer.as_ptr().add(std::mem::size_of::<u32>()) as *const MIB_TCPROW_OWNER_PID;
        for index in 0..header.count as usize {
            let row = &*rows.add(index);
            let port = u16::from_be((row.dwLocalPort & 0xFFFF) as u16);
            let address = format!(
                "{}.{}.{}.{}",
                row.dwLocalAddr & 0xFF,
                (row.dwLocalAddr >> 8) & 0xFF,
                (row.dwLocalAddr >> 16) & 0xFF,
                (row.dwLocalAddr >> 24) & 0xFF
            );
            ports.push(PortEntry {
                port,
                address,
                pid: row.dwOwningPid,
                process: names
                    .get(&row.dwOwningPid)
                    .cloned()
                    .unwrap_or_else(|| "unknown".into()),
            });
        }
    }
    ports.sort_by_key(|entry| entry.port);
    ports
}

/// Programs in the per-user and machine Startup folders.
pub fn startup_entries() -> Vec<StartupEntry> {
    let mut entries = Vec::new();
    let roots = [
        ("user", std::env::var("APPDATA").ok().map(|dir| {
            std::path::PathBuf::from(dir)
                .join("Microsoft\\Windows\\Start Menu\\Programs\\Startup")
        })),
        ("machine", std::env::var("PROGRAMDATA").ok().map(|dir| {
            std::path::PathBuf::from(dir)
                .join("Microsoft\\Windows\\Start Menu\\Programs\\Startup")
        })),
    ];

    for (scope, root) in roots {
        let Some(root) = root else { continue };
        let Ok(dir) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in dir.flatten() {
            let path = entry.path();
            let Some(name) = path.file_stem().map(|n| n.to_string_lossy().to_string()) else {
                continue;
            };
            if name.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
            entries.push(StartupEntry {
                name,
                path: path.to_string_lossy().to_string(),
                scope: scope.to_string(),
            });
        }
    }
    entries
}
