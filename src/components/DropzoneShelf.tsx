import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import { MAC_MODAL_SPRING } from "../sdk/motion";

export interface ShelfItem {
  path: string;
  name: string;
  isDir: boolean;
}

export interface DropzoneShelfProps {
  items: ShelfItem[];
  open: boolean;
  onRemove: (path: string) => void;
  onClear: () => void;
  onReveal: (path: string) => void;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : "FILE";
}

/**
 * Drop Shelf pocket: opens while files are dragged over the dock and keeps
 * staging them across apps, folders and virtual desktops.
 */
export function DropzoneShelf({ items, open, onRemove, onClear, onReveal }: DropzoneShelfProps) {
  const total = items.length;
  const label = useMemo(() => (total === 1 ? "1 item" : `${total} items`), [total]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ width: 0, opacity: 0, marginRight: 0, paddingInline: 0 }}
          animate={{ width: "auto", maxWidth: 420, opacity: 1, marginRight: 8, paddingInline: 10 }}
          exit={{ width: 0, opacity: 0, marginRight: 0, paddingInline: 0 }}
          transition={MAC_MODAL_SPRING}
          className="pointer-events-auto flex items-center gap-2 overflow-hidden will-change-transform"
          style={{
            height: "var(--glacier-bar-height)",
            borderRadius: "var(--glacier-radius)",
            background: "var(--glacier-elevated)",
            boxShadow: "0 0 0 1px var(--glacier-accent), var(--glacier-shadow)",
          }}
        >
      <div className="flex items-center gap-1.5">
        {items.slice(0, 5).map((item) => (
          <button
            key={item.path}
            type="button"
            title={item.path}
            onClick={() => onReveal(item.path)}
            className="group relative grid size-9 place-items-center rounded-lg bg-white/10 text-[9px] font-semibold uppercase"
          >
            <span className="truncate px-0.5">{extension(item.name)}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(item.path);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRemove(item.path);
              }}
              className="absolute -right-1 -top-1 hidden size-3.5 place-items-center rounded-full bg-black/70 text-[8px] group-hover:grid"
            >
              ×
            </span>
          </button>
        ))}
        {total > 5 && (
          <span className="text-[10px] opacity-70">+{total - 5}</span>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-[10px] font-semibold leading-tight">Drop Shelf</div>
        <div className="text-[9px] leading-tight opacity-60">{label}</div>
      </div>

      <button
        type="button"
        onClick={onClear}
        className="rounded-full px-2 py-1 text-[10px] font-medium opacity-70 hover:opacity-100"
      >
        Clear
      </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function toShelfItem(path: string): ShelfItem {
  const name = baseName(path);
  return { path, name, isDir: !name.includes(".") };
}
