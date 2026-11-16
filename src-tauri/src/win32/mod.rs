//! Windows-only shell integration. Every submodule is cfg-gated so the crate
//! still builds on macOS and Linux (used by CI and by the future cross-platform
//! builds), where the same functions become no-ops.

#[cfg(windows)]
pub mod apps;
#[cfg(windows)]
pub mod hit_test;
#[cfg(windows)]
pub mod hotkey;
#[cfg(windows)]
pub mod liquid_glass;
#[cfg(windows)]
pub mod monitors;
#[cfg(windows)]
pub mod taskbar;
#[cfg(windows)]
pub mod wallpaper;
