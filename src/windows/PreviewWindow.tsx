/**
 * Live DWM preview host. The thumbnail is composited by the desktop window
 * manager straight into this window's client area, so the web content stays
 * fully transparent and adds OpenTaskbar/Muelle's specular glass rim.
 */
export default function PreviewWindow() {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[14px] border border-white/25 bg-transparent"
      style={{
        boxShadow:
          "inset 0 1px 0 rgba(255, 255, 255, 0.36), 0 12px 32px rgba(5, 7, 11, 0.48)",
      }}
    >
      <span className="glacier-dock-sheen" aria-hidden />
    </div>
  );
}
