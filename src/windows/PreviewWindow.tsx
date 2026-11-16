/**
 * Live DWM preview host. The thumbnail is composited by the desktop window
 * manager straight into this window's client area, so the web content stays
 * fully transparent and just adds the glass rim.
 */
export default function PreviewWindow() {
  return (
    <div className="h-full w-full rounded-xl border border-white/20 bg-transparent" />
  );
}
