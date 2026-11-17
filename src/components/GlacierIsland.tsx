import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { MAC_MODAL_SPRING } from "../sdk/motion";

export interface IslandNotification {
  id: string;
  app: string;
  title: string;
  body: string;
  /** Accent for the app badge. */
  color?: string;
  kind?: "message" | "hardware" | "download" | "timer";
  /** 0..1 for download/timer progress badges. */
  progress?: number;
  replies?: boolean;
  receivedAt?: number;
}

export interface GlacierIslandProps {
  notification: IslandNotification | null;
  onDismiss: (id: string) => void;
  onReply?: (id: string, text: string) => void;
}

/**
 * Dynamic-Island-style pill: instead of a corner toast, the dock edge morphs
 * open with spring physics to show the incoming notification inline.
 */
export function GlacierIsland({ notification, onDismiss, onReply }: GlacierIslandProps) {
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (!notification) return;
    setReply("");
    if (notification.kind !== "timer" && notification.kind !== "download") return;
    // Hardware/download/timer toasts self-dismiss.
    const id = window.setTimeout(() => onDismiss(notification.id), 6000);
    return () => window.clearTimeout(id);
  }, [notification, onDismiss]);

  const color = notification?.color ?? "var(--glacier-accent)";
  const label = notification
    ? notification.kind === "hardware"
      ? "Connected"
      : notification.kind === "download"
        ? "Download"
        : notification.kind === "timer"
          ? "Timer"
          : notification.app
    : "";

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          key={notification.id}
          initial={{ width: 0, opacity: 0, marginRight: 0, paddingInline: 0, scale: 0.94 }}
          animate={{
            width: "auto",
            maxWidth: 340,
            opacity: 1,
            marginRight: 8,
            paddingInline: 10,
            scale: 1,
          }}
          exit={{ width: 0, opacity: 0, marginRight: 0, paddingInline: 0, scale: 0.94 }}
          transition={MAC_MODAL_SPRING}
          className="glacier-dock-glass pointer-events-auto flex items-center gap-3 overflow-hidden will-change-transform"
          style={{
            height: "var(--glacier-bar-height)",
            borderRadius: "var(--glacier-radius)",
          }}
        >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold uppercase shadow-sm"
        style={{
          background: notification.color ?? "var(--glacier-aurora)",
          color: "#0b1220",
        }}
      >
        {label.slice(0, 2)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold leading-tight">
          {notification.title}
        </div>
        <div className="truncate text-[10px] leading-tight opacity-70">{notification.body}</div>
        {typeof notification.progress === "number" && (
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(notification.progress * 100)}%`,
                background: color,
              }}
            />
          </div>
        )}
      </div>

      {notification.replies && onReply && (
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && reply.trim()) {
              onReply(notification.id, reply.trim());
              setReply("");
              onDismiss(notification.id);
            }
          }}
          placeholder="Quick reply"
          className="w-24 rounded-full bg-white/10 px-2 py-1 text-[10px] outline-none placeholder:opacity-50"
        />
      )}

      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 rounded-full px-2 py-1 text-[10px] font-medium opacity-70 hover:opacity-100"
      >
        Dismiss
      </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
