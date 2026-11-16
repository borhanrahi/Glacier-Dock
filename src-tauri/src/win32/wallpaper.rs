//! Wallpaper-adaptive "chameleon" accent and accessibility probes.
//!
//! Samples the active desktop wallpaper (no screen scraping, no network) and
//! derives a vivid accent hue used for the 1px specular rim and running-app
//! dots. High Contrast Mode forces the dock to the opaque `Solid` backdrop.

use std::ffi::c_void;

use windows::core::w;
use windows::Win32::UI::Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW};
use windows::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPI_GETDESKWALLPAPER, SPI_GETHIGHCONTRAST,
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

const MAX_PATH_CHARS: u32 = 260;

fn wallpaper_path() -> Option<String> {
    let mut buf = [0u16; MAX_PATH_CHARS as usize];
    unsafe {
        SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            MAX_PATH_CHARS,
            Some(buf.as_mut_ptr() as *mut c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .ok()?;
    }
    let path = String::from_utf16_lossy(&buf);
    let path = path.trim_end_matches('\0').to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let delta = max - min;

    let hue = if delta == 0.0 {
        0.0
    } else if max == rf {
        60.0 * (((gf - bf) / delta) % 6.0)
    } else if max == gf {
        60.0 * ((bf - rf) / delta + 2.0)
    } else {
        60.0 * ((rf - gf) / delta + 4.0)
    };
    let hue = if hue < 0.0 { hue + 360.0 } else { hue };
    let sat = if max == 0.0 { 0.0 } else { delta / max };
    (hue, sat, max)
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (u8, u8, u8) {
    let c = v * s;
    let h_prime = (h % 360.0) / 60.0;
    let x = c * (1.0 - ((h_prime % 2.0) - 1.0).abs());
    let (r1, g1, b1) = match h_prime as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = v - c;
    (
        ((r1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((g1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        ((b1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
    )
}

/// Dominant vivid hue from the wallpaper, as `#RRGGBB`.
pub fn accent_color() -> Option<String> {
    let path = wallpaper_path()?;
    let image = image::open(&path).ok()?;
    // Downscale hard: we only need the colour distribution.
    let small = image.resize_exact(48, 48, image::imageops::FilterType::Triangle);
    let rgb = small.to_rgb8();

    let mut buckets = [(0.0f32, 0.0f32, 0.0f32); 24]; // hue bucket, weight, mean saturation
    for pixel in rgb.pixels() {
        let (hue, sat, val) = rgb_to_hsv(pixel[0], pixel[1], pixel[2]);
        if sat < 0.18 || val < 0.12 {
            continue; // skip greys and near-black
        }
        let bucket = ((hue / 15.0) as usize).min(23);
        // Weight saturated, mid-bright pixels much higher.
        let weight = sat * sat * (1.0 - (val - 0.6).abs());
        buckets[bucket].0 += hue;
        buckets[bucket].1 += weight.max(0.0);
        buckets[bucket].2 += sat;
    }

    let (best_hue, weight, _) = buckets
        .iter()
        .enumerate()
        .map(|(i, b)| (*b, i))
        .max_by(|a, b| a.0 .1.total_cmp(&b.0 .1))?
        .0;
    if weight <= 0.0 {
        return None;
    }
    let hue = best_hue / weight;

    // Re-saturate so the rim tint stays legible on any wallpaper.
    let (r, g, b) = hsv_to_rgb(hue, 0.62, 0.98);
    Some(format!("#{r:02X}{g:02X}{b:02X}"))
}

/// Windows High Contrast Mode forces the opaque `Solid` backdrop.
pub fn high_contrast_enabled() -> bool {
    let mut hc = HIGHCONTRASTW {
        cbSize: std::mem::size_of::<HIGHCONTRASTW>() as u32,
        ..Default::default()
    };
    unsafe {
        SystemParametersInfoW(
            SPI_GETHIGHCONTRAST,
            hc.cbSize,
            Some(&mut hc as *mut _ as *mut c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .is_ok()
            && hc.dwFlags.contains(HCF_HIGHCONTRASTON)
    }
}

/// Exposed for diagnostics; unused paths are quiet in release builds.
#[allow(dead_code)]
pub fn wallpaper_name() -> Option<String> {
    let path = wallpaper_path()?;
    Some(
        std::path::Path::new(&path)
            .file_name()?
            .to_string_lossy()
            .to_string(),
    )
}

#[allow(dead_code)]
fn _keep_w_import() {
    let _ = w!("");
}
