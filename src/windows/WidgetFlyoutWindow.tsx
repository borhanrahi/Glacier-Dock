/**
 * Single-widget flyout: a small glass panel the dock opens for a catalog widget.
 * The widget id arrives either as `?widget=<id>` (first open) or as a
 * `glacier://widget-flyout` event when the window is reused for another widget.
 */

import { Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";

import { MAC_MODAL_SPRING, useWindowMotion } from "../sdk/motion";
import { widgetComponent, widgetMeta } from "../widgets/registry";

function fromQuery(): string {
  try {
    return new URLSearchParams(window.location.search).get("widget") ?? "";
  } catch {
    return "";
  }
}

export default function WidgetFlyoutWindow() {
  const [id, setId] = useState(fromQuery);
  const { showSeq, visible, dismiss } = useWindowMotion();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ id: string }>("glacier://widget-flyout", (event) => {
      if (event.payload?.id) setId(event.payload.id);
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      }
    };
    // This is a separate, focused window: a click on another widget, the dock
    // or the desktop blurs it. Auto-hide here so the flyout never lingers,
    // except while Windows Snipping Tool / Screen Clipping steals focus.
    const onBlur = () => {
      invoke<boolean>("is_screen_capture_active")
        .then((active) => {
          if (!active) dismiss();
        })
        .catch(() => dismiss());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      unlisten?.();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [dismiss]);

  const meta = widgetMeta(id);
  const Widget = widgetComponent(id);

  if (!id) return null;

  if (!meta || !Widget) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-[var(--glacier-border)] bg-[var(--glacier-surface)] text-[11px] text-[var(--glacier-text-muted)]">
        No widget “{id}” in the catalog.
      </div>
    );
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`${id}-${showSeq}`}
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.09 } }}
          transition={MAC_MODAL_SPRING}
          className="relative h-full w-full will-change-transform"
        >
          {/* Slim draggable strip along the top, kept below the close button. */}
          <div
            data-tauri-drag-region
            aria-hidden
            className="absolute left-2 right-10 top-0 z-20 h-4 cursor-move"
          />
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-[11px] text-[var(--glacier-text-muted)]">
                Loading {meta.name}…
              </div>
            }
          >
            <Widget />
          </Suspense>
          <button
            type="button"
            title="Close"
            onClick={dismiss}
            className="absolute right-1.5 top-1.5 z-30 grid size-5 place-items-center rounded-full bg-black/30 text-[10px] text-white/70 transition-colors hover:bg-black/60"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
