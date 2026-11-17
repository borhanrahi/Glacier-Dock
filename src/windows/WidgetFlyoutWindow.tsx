/**
 * Single-widget flyout: a small glass panel the dock opens for a catalog widget.
 * The widget id arrives either as `?widget=<id>` (first open) or as a
 * `glacier://widget-flyout` event when the window is reused for another widget.
 */

import { Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ id: string }>("glacier://widget-flyout", (event) => {
      if (event.payload?.id) setId(event.payload.id);
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const meta = widgetMeta(id);
  const Widget = widgetComponent(id);

  if (!meta || !Widget) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-[var(--glacier-border)] bg-[var(--glacier-surface)] text-[11px] text-[var(--glacier-text-muted)]">
        No widget “{id || "unknown"}” in the catalog.
      </div>
    );
  }

  return (
    <div className="glacier-modal-enter relative h-full w-full">
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
        onClick={() => invoke("hide_window").catch(() => {})}
        className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/30 text-[10px] text-white/70 hover:bg-black/60"
      >
        ×
      </button>
    </div>
  );
}
