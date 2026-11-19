import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "motion/react";

import { MAC_POPOVER_SPRING } from "../sdk/motion";
import type { InstalledApp } from "../utils/apps";

interface JumpItem {
  title: string;
  path: string;
}

export interface DockContextMenuProps {
  app: InstalledApp;
  pinned: boolean;
  anchorX: number;
  onClose: () => void;
  onLaunch: (app: InstalledApp) => void;
  onTogglePin: (app: InstalledApp) => void;
}

function parentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\//g, "\\");
  const idx = normalized.lastIndexOf("\\");
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

/**
 * Floating glass context menu for dock applications, combining OpenTaskbar's
 * Jump List destinations with Muelle's specular glass popup styling.
 */
export function DockContextMenu({
  app,
  pinned,
  anchorX,
  onClose,
  onLaunch,
  onTogglePin,
}: DockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [jumps, setJumps] = useState<JumpItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    invoke<JumpItem[]>("jump_destinations", { path: app.path })
      .then((items) => {
        if (!cancelled && Array.isArray(items)) {
          setJumps(items.slice(0, 4));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [app.path]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const left = Math.max(12, Math.min(anchorX - 105, window.innerWidth - 232));

  return (
    <motion.div
      ref={menuRef}
      data-no-drag
      role="menu"
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.1 } }}
      transition={MAC_POPOVER_SPRING}
      className="glacier-modal-glass pointer-events-auto fixed bottom-[calc(var(--glacier-bar-height)+var(--glacier-edge-margin)+12px)] z-50 w-[220px] overflow-hidden rounded-[14px] p-1.5 text-[12px] will-change-transform"
      style={{ left }}
    >
      <span className="glacier-dock-sheen" aria-hidden />
      <div className="truncate px-2.5 py-1.5 text-[11px] font-semibold opacity-65">
        {app.name}
      </div>
      <div className="my-1 h-px bg-white/[0.10]" />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onLaunch(app);
          onClose();
        }}
        className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.11]"
      >
        <span>Open</span>
        <span className="text-[10px] opacity-45">↵</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onTogglePin(app);
          onClose();
        }}
        className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.11]"
      >
        <span>{pinned ? "Unpin from Dock" : "Pin to Dock"}</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          invoke("open_path", { path: parentDirectory(app.path) }).catch(() => {});
          onClose();
        }}
        className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.11]"
      >
        <span>Reveal in Explorer</span>
      </button>

      {jumps.length > 0 && (
        <>
          <div className="my-1 h-px bg-white/[0.10]" />
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider opacity-45">
            Recent
          </div>
          {jumps.map((item) => (
            <button
              key={item.path}
              type="button"
              role="menuitem"
              onClick={() => {
                invoke("open_path", { path: item.path }).catch(() => {});
                onClose();
              }}
              className="block w-full truncate rounded-[9px] px-2.5 py-1.5 text-left text-[11px] opacity-90 transition-colors hover:bg-white/[0.11]"
            >
              {item.title}
            </button>
          ))}
        </>
      )}

      <div className="my-1 h-px bg-white/[0.10]" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          invoke("open_settings").catch(() => {});
          onClose();
        }}
        className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left opacity-80 transition-colors hover:bg-white/[0.11] hover:opacity-100"
      >
        <span>Glacier Settings</span>
      </button>
    </motion.div>
  );
}

/**
 * Right-click menu for the dock surface itself (OpenTaskbar-style):
 * quick access to Launcher, Spotlight, Activity Monitor, Dropzone, Settings,
 * and native Windows taskbar recovery.
 */
export function DockSurfaceMenu({
  anchorX,
  hasShelf,
  onToggleShelf,
  onClose,
}: {
  anchorX: number;
  hasShelf: boolean;
  onToggleShelf: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const left = Math.max(12, Math.min(anchorX - 105, window.innerWidth - 232));

  const item = (label: string, shortcut: string | null, action: () => void) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      onClick={() => {
        action();
        onClose();
      }}
      className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.11]"
    >
      <span>{label}</span>
      {shortcut && <span className="text-[10px] opacity-45">{shortcut}</span>}
    </button>
  );

  return (
    <motion.div
      ref={menuRef}
      data-no-drag
      role="menu"
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.1 } }}
      transition={MAC_POPOVER_SPRING}
      className="glacier-modal-glass pointer-events-auto fixed bottom-[calc(var(--glacier-bar-height)+var(--glacier-edge-margin)+12px)] z-50 w-[220px] overflow-hidden rounded-[14px] p-1.5 text-[12px] will-change-transform"
      style={{ left }}
    >
      <span className="glacier-dock-sheen" aria-hidden />
      <div className="px-2.5 py-1 text-[11px] font-semibold opacity-65">Glacier Dock</div>
      <div className="my-1 h-px bg-white/[0.10]" />
      {item("App Library", null, () => invoke("open_launcher").catch(() => {}))}
      {item("Spotlight", "Alt+Space", () => invoke("open_spotlight").catch(() => {}))}
      {item("Activity Monitor", null, () => invoke("task_manager").catch(() => {}))}
      {hasShelf && item("Toggle Dropzone Shelf", null, onToggleShelf)}
      <div className="my-1 h-px bg-white/[0.10]" />
      {item("Glacier Settings", null, () => invoke("open_settings").catch(() => {}))}
      {item("Restore Default Settings", null, () => invoke("reset_config").catch(() => {}))}
      {item("Restore Windows Taskbar", null, () =>
        invoke("restore_native_taskbar").catch(() => {}),
      )}
      <div className="my-1 h-px bg-white/[0.10]" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          invoke("quit_app").catch(() => {});
          onClose();
        }}
        className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left text-red-300 transition-colors hover:bg-red-500/20"
      >
        <span>Quit Glacier Dock</span>
      </button>
    </motion.div>
  );
}
