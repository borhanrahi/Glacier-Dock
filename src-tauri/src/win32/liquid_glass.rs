//! Live "liquid glass" desktop capture.
//!
//! One DXGI Desktop Duplication session per output, scoped strictly to each
//! dock's screen rectangle:
//!
//!   * `AccumulatedFrames == 0`  -> nothing on the desktop changed, we release
//!     the frame and do zero GPU/CPU work (the relaxation mode).
//!   * dirty rects that never intersect the dock -> same early-out.
//!   * only the intersecting pixels are copied into a staging texture and
//!     handed to the WebGL2 refraction shader.
//!
//! Frames are pulled by the webview (`glass_frame`) after a tiny `glass-frame`
//! event, so no pixels ever travel through JSON.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use windows::core::Interface;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_BOX,
    D3D11_CPU_ACCESS_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
    DXGI_OUTDUPL_FRAME_INFO,
};

use crate::win32::monitors;

const WAIT_TIMEOUT: i32 = 0x887A0027u32 as i32;
const ACCESS_LOST: i32 = 0x887A0022u32 as i32;
const MAX_DIRTY_RECTS: usize = 512;

#[derive(Clone)]
pub struct Frame {
    pub seq: u64,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Clone, Copy)]
struct ScreenRect {
    left: i32,
    top: i32,
    width: u32,
    height: u32,
}

/// label -> screen rect of the pill (physical pixels)
static TARGETS: Mutex<Vec<(String, ScreenRect)>> = Mutex::new(Vec::new());
/// label -> newest captured frame
static FRAMES: Mutex<Vec<(String, Frame)>> = Mutex::new(Vec::new());

pub fn set_target(label: &str, x: i32, y: i32, width: u32, height: u32) {
    let rect = ScreenRect {
        left: x,
        top: y,
        width: width.max(1),
        height: height.max(1),
    };
    if let Ok(mut targets) = TARGETS.lock() {
        match targets.iter_mut().find(|(l, _)| l == label) {
            Some(entry) => entry.1 = rect,
            None => targets.push((label.to_string(), rect)),
        }
    }
}

#[allow(dead_code)] // used when a dock window is destroyed on display removal
pub fn clear_target(label: &str) {
    if let Ok(mut targets) = TARGETS.lock() {
        targets.retain(|(l, _)| l != label);
    }
}

pub fn latest_frame(label: &str, since: u64) -> Option<Frame> {
    FRAMES
        .lock()
        .ok()?
        .iter()
        .find(|(l, f)| l == label && f.seq > since)
        .map(|(_, f)| f.clone())
}

fn store_frame(label: &str, frame: Frame) {
    if let Ok(mut frames) = FRAMES.lock() {
        match frames.iter_mut().find(|(l, _)| l == label) {
            Some(entry) => entry.1 = frame,
            None => frames.push((label.to_string(), frame)),
        }
    }
}

struct Capture {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    output: (i32, i32),
    staging: Option<(u32, u32, ID3D11Texture2D)>,
    seq: u64,
}

impl Capture {
    fn new(monitor: &monitors::MonitorInfo) -> Result<Self, String> {
        unsafe {
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;
            D3D11CreateDevice(
                None::<&IDXGIAdapter>,
                D3D_DRIVER_TYPE_HARDWARE,
                Default::default(),
                Default::default(),
                Some(&[D3D_FEATURE_LEVEL_11_0]),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .map_err(|e| format!("D3D11CreateDevice: {e}"))?;

            let device = device.ok_or("no D3D11 device")?;
            let context = context.ok_or("no D3D11 context")?;
            let dxgi_device: IDXGIDevice = device.cast().map_err(|e| e.to_string())?;
            let adapter: IDXGIAdapter = dxgi_device.GetAdapter().map_err(|e| e.to_string())?;

            let mut chosen = None;
            for index in 0..16u32 {
                let Ok(output) = adapter.EnumOutputs(index) else {
                    break;
                };
                let desc = output.GetDesc().map_err(|e| e.to_string())?;
                if !desc.AttachedToDesktop.as_bool() {
                    continue;
                }
                let r = desc.DesktopCoordinates;
                if r.left == monitor.x
                    && r.top == monitor.y
                    && r.right - r.left == monitor.width
                    && r.bottom - r.top == monitor.height
                {
                    chosen = Some((output, r));
                    break;
                }
            }
            let (output, rect) = chosen.ok_or("no DXGI output for this monitor")?;
            let output1: IDXGIOutput1 = output.cast().map_err(|e| e.to_string())?;
            let duplication = output1
                .DuplicateOutput(&device)
                .map_err(|e| format!("DuplicateOutput: {e}"))?;

            Ok(Self {
                device,
                context,
                duplication,
                output: (rect.left, rect.top),
                staging: None,
                seq: 0,
            })
        }
    }

    fn ensure_staging(&mut self, width: u32, height: u32) -> Result<(), String> {
        if let Some((w, h, _)) = &self.staging {
            if *w == width && *h == height {
                return Ok(());
            }
        }
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };
        let mut texture: Option<ID3D11Texture2D> = None;
        unsafe {
            self.device
                .CreateTexture2D(&desc, None, Some(&mut texture))
                .map_err(|e| format!("CreateTexture2D: {e}"))?;
        }
        let texture = texture.ok_or("CreateTexture2D returned no texture")?;
        self.staging = Some((width, height, texture));
        Ok(())
    }

    /// Capture the region, or `None` when the desktop behind it did not change.
    fn capture(&mut self, region: ScreenRect) -> Result<Option<Frame>, String> {
        let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;

        let acquired = unsafe { self.duplication.AcquireNextFrame(16, &mut info, &mut resource) };
        match acquired {
            Ok(()) => {}
            // Nothing new on screen: full relaxation, no copy, no shader pass.
            Err(err) if err.code().0 == WAIT_TIMEOUT => return Ok(None),
            Err(err) if err.code().0 == ACCESS_LOST => return Err("access lost".into()),
            Err(err) => return Err(format!("AcquireNextFrame: {err}")),
        }

        if info.AccumulatedFrames == 0 {
            let _ = unsafe { self.duplication.ReleaseFrame() };
            return Ok(None);
        }

        // Dirty-rect gate: is anything in our dock region actually dirty?
        let mut rects = [RECT::default(); MAX_DIRTY_RECTS];
        let mut required: u32 = 0;
        let dirty_ok = unsafe {
            self.duplication
                .GetFrameDirtyRects(
                    (rects.len() * std::mem::size_of::<RECT>()) as u32,
                    rects.as_mut_ptr(),
                    &mut required,
                )
                .is_ok()
        };
        if dirty_ok && required > 0 {
            let rect_size = std::mem::size_of::<RECT>() as u32;
            let count = (required / rect_size).min(MAX_DIRTY_RECTS as u32) as usize;
            if count > 0 && !rects[..count].iter().any(|r| intersects(r, region, self.output)) {
                let _ = unsafe { self.duplication.ReleaseFrame() };
                return Ok(None);
            }
        }

        let Some(resource) = resource else {
            let _ = unsafe { self.duplication.ReleaseFrame() };
            return Ok(None);
        };

        let result = self.copy_region(&resource, region);
        let _ = unsafe { self.duplication.ReleaseFrame() };
        result
    }

    fn copy_region(
        &mut self,
        resource: &IDXGIResource,
        region: ScreenRect,
    ) -> Result<Option<Frame>, String> {
        let texture: ID3D11Texture2D = resource.cast().map_err(|e| e.to_string())?;
        self.ensure_staging(region.width, region.height)?;
        let Some((_, _, staging)) = &self.staging else {
            return Ok(None);
        };

        let src = D3D11_BOX {
            left: (region.left - self.output.0).max(0) as u32,
            top: (region.top - self.output.1).max(0) as u32,
            front: 0,
            right: (region.left - self.output.0).max(0) as u32 + region.width,
            bottom: (region.top - self.output.1).max(0) as u32 + region.height,
            back: 1,
        };

        unsafe {
            self.context
                .CopySubresourceRegion(staging, 0, 0, 0, 0, &texture, 0, Some(&src));

            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .map_err(|e| format!("Map: {e}"))?;

            let pitch = mapped.RowPitch as usize;
            let width = region.width as usize;
            let height = region.height as usize;
            let mut rgba = vec![0u8; width * height * 4];
            let src_ptr = mapped.pData as *const u8;
            for y in 0..height {
                let row = src_ptr.add(y * pitch);
                let dst = &mut rgba[y * width * 4..(y + 1) * width * 4];
                for x in 0..width {
                    let px = row.add(x * 4);
                    // BGRA -> RGBA
                    dst[x * 4] = *px.add(2);
                    dst[x * 4 + 1] = *px.add(1);
                    dst[x * 4 + 2] = *px;
                    dst[x * 4 + 3] = 255;
                }
            }

            self.context.Unmap(staging, 0);
            self.seq += 1;

            Ok(Some(Frame {
                seq: self.seq,
                width: region.width,
                height: region.height,
                rgba,
            }))
        }
    }
}

fn intersects(dirty: &RECT, region: ScreenRect, output: (i32, i32)) -> bool {
    // Dirty rects are in output-relative coordinates.
    let left = dirty.left + output.0;
    let top = dirty.top + output.1;
    let right = dirty.right + output.0;
    let bottom = dirty.bottom + output.1;
    left < region.left + region.width as i32
        && right > region.left
        && top < region.top + region.height as i32
        && bottom > region.top
}

/// Start the capture loop. Idles at 200ms when no dock is registered, and only
/// emits an event when pixels actually changed.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut captures: Vec<(String, Capture)> = Vec::new();
        let mut last_emit: Vec<(String, Instant)> = Vec::new();

        loop {
            let targets: Vec<(String, ScreenRect)> = match TARGETS.lock() {
                Ok(t) => t.clone(),
                Err(_) => break,
            };

            if targets.is_empty() {
                std::thread::sleep(Duration::from_millis(200));
                continue;
            }

            for (label, region) in &targets {
                let Some(monitor) = monitors::monitor_for_point(
                    region.left + region.width as i32 / 2,
                    region.top + region.height as i32 / 2,
                ) else {
                    continue;
                };

                if !captures.iter().any(|(device, _)| *device == monitor.device) {
                    match Capture::new(&monitor) {
                        Ok(capture) => captures.push((monitor.device.clone(), capture)),
                        Err(err) => {
                            eprintln!("glacier: capture unavailable on {}: {err}", monitor.device);
                            // Retry later instead of spinning.
                            std::thread::sleep(Duration::from_secs(2));
                            continue;
                        }
                    }
                }

                let Some(index) = captures.iter().position(|(d, _)| *d == monitor.device) else {
                    continue;
                };

                match captures[index].1.capture(*region) {
                    Ok(Some(frame)) => {
                        store_frame(label, frame.clone());
                        // Cap the wake-up rate at ~60fps per dock.
                        let due = last_emit
                            .iter()
                            .find(|(l, _)| l == label)
                            .map(|(_, t)| t.elapsed() >= Duration::from_millis(15))
                            .unwrap_or(true);
                        if due {
                            let _ = app.emit_to(
                                label.as_str(),
                                "glacier://glass-frame",
                                serde_json::json!({ "label": label, "seq": frame.seq }),
                            );
                            match last_emit.iter_mut().find(|(l, _)| l == label) {
                                Some(entry) => entry.1 = Instant::now(),
                                None => last_emit.push((label.clone(), Instant::now())),
                            }
                        }
                    }
                    Ok(None) => {}
                    Err(err) => {
                        eprintln!("glacier: capture reset on {}: {err}", monitor.device);
                        captures.remove(index);
                        std::thread::sleep(Duration::from_millis(500));
                    }
                }
            }

            std::thread::sleep(Duration::from_millis(8));
        }
    });
}
