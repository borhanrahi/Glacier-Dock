import { useEffect, useRef, useState } from "react";

import {
  FOLDER_COLORS,
  appHue,
  initials,
  type InstalledApp,
} from "../utils/apps";

export interface AppFolderTileProps {
  name: string;
  color: string;
  apps: InstalledApp[];
  onLaunch: (app: InstalledApp) => void;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onRemoveApp: (path: string) => void;
  onAddApp?: () => void;
  vertical?: boolean;
}

/**
 * `2 x 2` mini-icon cluster with a color-tinted border. Clicking opens a
 * 3-column app grid popover with inline rename, item count, 8 swatches and
 * `+ Add App`.
 */
export function AppFolderTile({
  name,
  color,
  apps,
  onLaunch,
  onRename,
  onColor,
  onRemoveApp,
  onAddApp,
  vertical = false,
}: AppFolderTileProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(name), [name]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const preview = apps.slice(0, 4);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={name}
        className="relative grid size-[var(--glacier-icon-base)] place-items-center rounded-xl transition-transform"
        style={{
          transform:
            "translateY(calc(var(--icon-lift, 0px) * -1)) scale(var(--icon-scale, 1))",
          transformOrigin: vertical ? "center left" : "center bottom",
          background: `${color}22`,
          boxShadow: `inset 0 0 0 1px ${color}`,
        }}
      >
        <span className="grid grid-cols-2 gap-0.5">
          {Array.from({ length: 4 }).map((_, index) => {
            const app = preview[index];
            return (
              <span
                key={index}
                className="grid size-[42%] min-h-2 min-w-2 place-items-center rounded-[3px] text-[6px] font-bold"
                style={{
                  background: app
                    ? `hsl(${appHue(app.name)} 70% 52% / 0.85)`
                    : "rgba(255,255,255,0.10)",
                  color: "#08111d",
                }}
              >
                {app ? initials(app.name) : ""}
              </span>
            );
          })}
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 w-64 rounded-2xl p-3 backdrop-blur-2xl"
          style={{
            background: "var(--glacier-elevated)",
            boxShadow: "var(--glacier-shadow)",
            bottom: vertical ? undefined : "calc(100% + 12px)",
            left: vertical ? "calc(100% + 12px)" : 0,
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  setEditing(false);
                  onRename(draft.trim() || name);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setEditing(false);
                    onRename(draft.trim() || name);
                  }
                }}
                className="min-w-0 flex-1 rounded bg-white/10 px-1.5 py-0.5 text-xs outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => setEditing(true)}
                className="min-w-0 flex-1 truncate text-left text-xs font-semibold"
              >
                {name}
              </button>
            )}
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] opacity-80">
              {apps.length} items
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {apps.map((app) => (
              <button
                key={app.path}
                type="button"
                onClick={() => onLaunch(app)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onRemoveApp(app.path);
                }}
                title={`${app.name} — right-click to remove`}
                className="flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-white/10"
              >
                <span
                  className="grid size-8 place-items-center rounded-lg text-[9px] font-bold"
                  style={{
                    background: `hsl(${appHue(app.name)} 70% 52% / 0.9)`,
                    color: "#08111d",
                  }}
                >
                  {initials(app.name)}
                </span>
                <span className="w-full truncate text-center text-[8px] leading-tight opacity-80">
                  {app.name}
                </span>
              </button>
            ))}
            {onAddApp && (
              <button
                type="button"
                onClick={onAddApp}
                className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-white/20 text-[9px] opacity-70 hover:opacity-100"
              >
                + Add App
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center gap-1.5 border-t border-white/10 pt-2">
            {FOLDER_COLORS.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                title={swatch.name}
                onClick={() => onColor(swatch.value)}
                className="size-3.5 rounded-full"
                style={{
                  background: swatch.value,
                  boxShadow:
                    swatch.value === color ? "0 0 0 2px rgba(255,255,255,0.85)" : "none",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
