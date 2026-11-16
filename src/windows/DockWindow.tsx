/**
 * DockWindow — per-display dock pill.
 * Milestone 1 brings the Win32 shell (taskbar hiding, monitor enumeration,
 * DXGI capture); this placeholder just proves the glass surface renders.
 */
export default function DockWindow() {
  return (
    <div className="grid h-full w-full place-items-end justify-center p-2">
      <div
        className="flex items-center gap-2 px-4 py-2 text-xs font-medium backdrop-blur-[28px]"
        style={{
          height: "var(--glacier-bar-height)",
          borderRadius: "var(--glacier-radius)",
          background: "var(--glacier-surface)",
          boxShadow: "var(--glacier-shadow)",
          opacity: 0.95,
        }}
      >
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: "var(--glacier-accent)" }}
        />
        Glacier Dock
      </div>
    </div>
  );
}
