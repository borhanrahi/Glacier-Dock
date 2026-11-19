/**
 * One telemetry subscription for the whole dock.
 *
 * The Rust bus pushes a frame every second. Subscribing to that event inside a
 * component re-rendered that component's entire subtree (the dock included)
 * once per frame. Keeping the frame in a module-level `useSyncExternalStore`
 * source lets only the handful of components that display live numbers update.
 */

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { EMPTY_TELEMETRY } from "./hooks";
import type { TelemetryFrame } from "./bridge";

const EVENT = "glacier://telemetry";

let frame: TelemetryFrame = EMPTY_TELEMETRY;
let started = false;
const listeners = new Set<() => void>();

function publish(next: TelemetryFrame) {
  if (!next) return;
  frame = next;
  for (const listener of listeners) listener();
}

function ensureStarted() {
  if (started) return;
  started = true;
  invoke<TelemetryFrame>("telemetry_snapshot")
    .then((next) => publish(next))
    .catch(() => {});
  listen<TelemetryFrame>(EVENT, (event) => publish(event.payload)).catch(() => {});
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureStarted();
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): TelemetryFrame {
  return frame;
}

/** Live telemetry without owning a per-frame state update in the parent. */
export function useSharedTelemetry(): TelemetryFrame {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
