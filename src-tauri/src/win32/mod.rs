//! Windows-only shell integration. Every submodule is cfg-gated so the crate
//! still builds on macOS and Linux (used by CI and by the future cross-platform
//! builds), where the same functions become no-ops.

#[cfg(windows)]
pub mod ai_usage;
#[cfg(windows)]
pub mod apps;
#[cfg(windows)]
pub mod autostart;
#[cfg(windows)]
pub mod automations;
#[cfg(windows)]
pub mod community_store;
#[cfg(windows)]
pub mod dwm_preview;
#[cfg(windows)]
pub mod hit_test;
#[cfg(windows)]
pub mod icons;
#[cfg(windows)]
pub mod hotkey;
#[cfg(windows)]
pub mod jumplist;
#[cfg(windows)]
pub mod process_manager;
#[cfg(windows)]
pub mod profiles;
#[cfg(windows)]
pub mod systray;
#[cfg(windows)]
pub mod liquid_glass;
#[cfg(windows)]
pub mod monitors;
#[cfg(windows)]
pub mod taskbar;
#[cfg(windows)]
pub mod telemetry;
#[cfg(windows)]
pub mod wallpaper;
