/**
 * Taskbar-corner style hidden/tray apps panel.
 *
 * Unlike the single-widget flyout this window deliberately does NOT hide on
 * blur: the dock's `^` button is a real toggle, so a blur-then-click race would
 * otherwise close and immediately reopen it. Escape and the close button use
 * `dismiss_host_window`, which keeps every dock's button state in sync.
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";

import { MAC_MODAL_SPRING, useWindowMotion } from "../sdk/motion";
import BackgroundApps from "../widgets/system/BackgroundApps";

export default function HiddenAppsWindow() {
  const { showSeq, visible } = useWindowMotion();

  const close = () => {
    invoke("dismiss_host_window").catch(() => {});
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={showSeq}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.09 } }}
          transition={MAC_MODAL_SPRING}
          className="relative h-full w-full will-change-transform"
        >
          <BackgroundApps />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
