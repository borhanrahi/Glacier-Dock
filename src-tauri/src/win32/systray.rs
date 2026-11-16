//! Notification area icon with a Glacier Dock menu.
//!
//! The tray keeps the dock reachable if a display is removed or the pill gets
//! dragged somewhere unexpected, and is the only way back if the taskbar is
//! hidden and the dock crashes without restoring it.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

pub fn install(app: &AppHandle) {
    let Ok(spotlight) = MenuItem::with_id(app, "spotlight", "Open Spotlight", true, None::<&str>)
    else {
        return;
    };
    let Ok(task_manager) =
        MenuItem::with_id(app, "task-manager", "Task Manager", true, None::<&str>)
    else {
        return;
    };
    let Ok(restore) =
        MenuItem::with_id(app, "restore-taskbar", "Restore Windows taskbar", true, None::<&str>)
    else {
        return;
    };
    let Ok(quit) = MenuItem::with_id(app, "quit", "Quit Glacier Dock", true, None::<&str>) else {
        return;
    };

    let Ok(menu) = Menu::with_items(app, &[&spotlight, &task_manager, &restore, &quit]) else {
        return;
    };

    let mut builder = TrayIconBuilder::new()
        .tooltip("Glacier Dock")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "spotlight" => crate::toggle_spotlight(app),
            "task-manager" => {
                let _ = crate::open_task_manager(app);
            }
            "restore-taskbar" => crate::restore_taskbar(),
            "quit" => {
                crate::restore_taskbar();
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let _ = builder.build(app);
}
