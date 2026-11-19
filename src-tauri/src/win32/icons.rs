//! High-DPI shell icon extraction without `.lnk` shortcut arrows.
//!
//! Shortcuts on disk have no image payload of their own, so we resolve the pure
//! system image-list index via `SHGetFileInfoW(..., SHGFI_SYSICONINDEX)` (no
//! `SHGFI_LINKOVERLAY`) and pull the crisp 256×256 `SHIL_JUMBO` icon (falling
//! back to 48×48 `SHIL_EXTRALARGE` if a legacy app only supplies a small icon in
//! the top-left corner of the jumbo bitmap). `GetDIBits` yields `BGRA` pixels,
//! so Blue and Red are swapped to `RGBA` before PNG encoding.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP,
    BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Controls::IImageList;
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SYSICONINDEX,
    SHIL_EXTRALARGE, SHIL_JUMBO,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

/// Icons larger than this are ignored rather than shoved into the webview.
const MAX_PX: u32 = 256;
const ILD_TRANSPARENT: u32 = 0x0000_0001;

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// PNG data URL for a shortcut/executable, or `None` when the shell has no icon.
pub fn icon_data_url(path: &str) -> Option<String> {
    let key = path.to_ascii_lowercase();
    if let Ok(cache) = cache().lock() {
        if let Some(hit) = cache.get(&key) {
            return hit.clone();
        }
    }
    let rendered = unsafe { render(path) };
    if let Ok(mut cache) = cache().lock() {
        cache.insert(key, rendered.clone());
    }
    rendered
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn extract_from_list(list_id: u32, icon_index: i32, reject_jumbo_corner: bool) -> Option<String> {
    let list: IImageList = unsafe { SHGetImageList(list_id as i32) }.ok()?;
    let hicon = unsafe { list.GetIcon(icon_index, ILD_TRANSPARENT) }.ok()?;
    if hicon.is_invalid() {
        return None;
    }
    let png = unsafe { bitmap_to_png(hicon, reject_jumbo_corner) };
    let _ = unsafe { DestroyIcon(hicon) };
    png
}

unsafe fn render(path: &str) -> Option<String> {
    let com_ok = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok();
    let file = wide(path);

    let mut info = SHFILEINFOW::default();
    let idx_ok = unsafe {
        SHGetFileInfoW(
            PCWSTR(file.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_SYSICONINDEX,
        )
    };

    let result = if idx_ok != 0 {
        let icon_index = info.iIcon;
        unsafe { extract_from_list(SHIL_JUMBO, icon_index, true) }
            .or_else(|| unsafe { extract_from_list(SHIL_EXTRALARGE, icon_index, false) })
    } else {
        None
    }
    .or_else(|| {
        let mut fallback = SHFILEINFOW::default();
        let ok = unsafe {
            SHGetFileInfoW(
                PCWSTR(file.as_ptr()),
                FILE_FLAGS_AND_ATTRIBUTES(0),
                Some(&mut fallback),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            )
        };
        if ok == 0 || fallback.hIcon.is_invalid() {
            return None;
        }
        let png = unsafe { bitmap_to_png(fallback.hIcon, false) };
        let _ = unsafe { DestroyIcon(fallback.hIcon) };
        png
    });

    if com_ok {
        unsafe { CoUninitialize() };
    }
    result
}

unsafe fn bitmap_to_png(hicon: HICON, reject_jumbo_corner: bool) -> Option<String> {
    let mut icon = ICONINFO::default();
    unsafe { GetIconInfo(hicon, &mut icon) }.ok()?;

    let color = icon.hbmColor;
    let mask = icon.hbmMask;
    // Monochrome icons only ship a mask.
    let source = if color.is_invalid() { mask } else { color };
    if source.is_invalid() {
        if !mask.is_invalid() {
            let _ = unsafe { DeleteObject(HGDIOBJ(mask.0)) };
        }
        return None;
    }

    let result = unsafe { dib_to_png(source, reject_jumbo_corner) };

    if !color.is_invalid() {
        let _ = unsafe { DeleteObject(HGDIOBJ(color.0)) };
    }
    if !mask.is_invalid() {
        let _ = unsafe { DeleteObject(HGDIOBJ(mask.0)) };
    }
    result
}

unsafe fn dib_to_png(
    bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
    reject_jumbo_corner: bool,
) -> Option<String> {
    let mut header = BITMAP::default();
    let read = unsafe {
        GetObjectW(
            HGDIOBJ(bitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut header as *mut BITMAP as *mut _),
        )
    };
    if read == 0 {
        return None;
    }

    let width = header.bmWidth.max(0) as u32;
    let height = header.bmHeight.max(0) as u32;
    if width == 0 || height == 0 || width > MAX_PX || height > MAX_PX {
        return None;
    }

    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width as i32,
        biHeight: -(height as i32), // top-down rows
        biPlanes: 1,
        biBitCount: 32,
        biCompression: 0, // BI_RGB
        ..Default::default()
    };

    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let screen = unsafe { GetDC(None) };
    let memory = unsafe { CreateCompatibleDC(Some(screen)) };
    let copied = unsafe {
        GetDIBits(
            memory,
            bitmap,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut info,
            DIB_RGB_COLORS,
        )
    };
    let _ = unsafe { DeleteDC(memory) };
    let _ = unsafe { ReleaseDC(None, screen) };
    if copied == 0 {
        return None;
    }

    // Windows 32-bit BI_RGB DIBs store channels as BGRA; swap B and R for RGBA PNG encoding.
    for px in pixels.chunks_exact_mut(4) {
        px.swap(0, 2);
    }

    // Icons without an alpha channel come back opaque; treat pure black as the
    // transparent key so they do not paint a black square onto the dock.
    let has_alpha = pixels.chunks_exact(4).any(|px| px[3] != 0);
    if !has_alpha {
        for px in pixels.chunks_exact_mut(4) {
            let transparent = px[0] == 0 && px[1] == 0 && px[2] == 0;
            px[3] = if transparent { 0 } else { 255 };
        }
    }

    // Legacy apps without a 256px resource get drawn as a tiny 32/48px icon in
    // the top-left quadrant of SHIL_JUMBO; reject those and fall back to 48px.
    if reject_jumbo_corner && width >= 128 {
        let mut any_opaque = false;
        let mut max_x = 0u32;
        let mut max_y = 0u32;
        for (idx, px) in pixels.chunks_exact(4).enumerate() {
            if px[3] > 8 {
                any_opaque = true;
                let x = (idx as u32) % width;
                let y = (idx as u32) / width;
                if x > max_x {
                    max_x = x;
                }
                if y > max_y {
                    max_y = y;
                }
            }
        }
        if !any_opaque || (max_x < 72 && max_y < 72) {
            return None;
        }
    }

    let image = image::RgbaImage::from_raw(width, height, pixels)?;
    let mut png = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(image)
        .write_to(&mut png, image::ImageFormat::Png)
        .ok()?;

    Some(format!("data:image/png;base64,{}", base64(png.get_ref())))
}

/// Minimal standard base64 so the icon path needs no extra dependency.
fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let value = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(ALPHABET[(value >> 18) as usize & 63] as char);
        out.push(ALPHABET[(value >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(value >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[value as usize & 63] as char
        } else {
            '='
        });
    }
    out
}
