#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(linker_messages)]

fn main() {
    #[cfg(windows)]
    {
        unsafe {
            use windows::Win32::UI::HiDpi::{
                SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
            };
            let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }

        // Uninstaller / recovery entry point. Must work with no Tauri app, no
        // WebView2 and no config: it only replays the taskbar journal.
        if std::env::args().any(|arg| arg == "--restore-taskbar") {
            glacier_dock_lib::restore_taskbar_cli();
            return;
        }
        if !single_instance() {
            eprintln!("glacier: another instance is already running");
            return;
        }
    }

    // Never leave the user without a taskbar if a worker thread panics.
    std::panic::set_hook(Box::new(|info| {
        glacier_dock_lib::restore_taskbar();
        eprintln!("glacier: fatal: {info}");
    }));

    glacier_dock_lib::run();
}

/// Single-instance guard: a hidden window whose class is unique to Glacier
/// Dock. If it already exists another instance owns the taskbar journal.
#[cfg(windows)]
fn single_instance() -> bool {
    use windows::core::w;
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, FindWindowW, RegisterClassW, WINDOW_EX_STYLE,
        WINDOW_STYLE, WNDCLASSW,
    };

    unsafe extern "system" fn guard_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    let class = w!("GlacierDockInstanceGuard");
    let title = w!("Glacier Dock");
    unsafe {
        if FindWindowW(class, title).is_ok() {
            return false;
        }
        let Ok(instance) = GetModuleHandleW(None) else {
            return true;
        };
        let wc = WNDCLASSW {
            lpfnWndProc: Some(guard_proc),
            hInstance: HINSTANCE(instance.0),
            lpszClassName: class,
            ..Default::default()
        };
        RegisterClassW(&wc);
        // Deliberately leaked: it must live for the whole process lifetime.
        let _ = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class,
            title,
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            None,
            None,
            Some(HINSTANCE(instance.0)),
            None,
        );
    }
    true
}
