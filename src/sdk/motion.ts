import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Transition } from "motion/react";

/** Aceternity Floating Dock spring curve for continuous pointer tracking. */
export const MAC_DOCK_SPRING = {
  mass: 0.1,
  stiffness: 150,
  damping: 12,
} as const;

/** Snappy spring for dock popovers, context menus, shelf, and island. */
export const MAC_POPOVER_SPRING: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 34,
  mass: 0.5,
};

/** Critically damped spring for floating panels, widget flyouts, and modals. */
export const MAC_MODAL_SPRING: Transition = {
  type: "spring",
  stiffness: 460,
  damping: 36,
  mass: 0.65,
};

/** Fast micro-spring for floating glass tooltips and badges. */
export const MAC_TOOLTIP_SPRING: Transition = {
  type: "spring",
  stiffness: 540,
  damping: 32,
  mass: 0.4,
};

/** Shared-layout pill indicator spring for navigation tabs. */
export const MAC_TAB_SPRING: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 35,
};

/**
 * Coordinates entrance replay + exit animation for reusable hidden Tauri windows.
 * Rust emits `glacier://window-show` each time a window opens or re-opens.
 */
export function useWindowMotion() {
  const [showSeq, setShowSeq] = useState(0);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("glacier://window-show", () => {
      // A re-open (e.g. clicking a second widget) must win over a dismissal
      // that is still waiting on its exit animation.
      if (hideTimer.current !== undefined) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = undefined;
      }
      setVisible(true);
      setShowSeq((seq) => seq + 1);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined;
      invoke("hide_window").catch(() => {});
    }, 90);
  }, []);

  return { showSeq, visible, dismiss };
}
