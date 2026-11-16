/**
 * React bindings for the SDK bridge: telemetry, clocks and persisted widget
 * state. Every hook degrades to a local value when running in a plain browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import glacier, { type TelemetryFrame } from "./bridge";

const EMPTY_TELEMETRY: TelemetryFrame = {
  seq: 0,
  timestampMs: 0,
  uptimeSecs: 0,
  cpuPercent: 0,
  cpuUserPercent: 0,
  cpuKernelPercent: 0,
  ramUsedMb: 0,
  ramTotalMb: 0,
  ramPercent: 0,
  commitUsedMb: 0,
  diskFreeGb: 0,
  diskTotalGb: 0,
  netDownBps: 0,
  netUpBps: 0,
  batteryPercent: null,
  batteryCharging: false,
  batterySecondsLeft: null,
  topProcess: null,
  gpuPercent: null,
  temperatureC: null,
};

/** Live telemetry frame (1 Hz default from the Rust bus). */
export function useTelemetry(): TelemetryFrame {
  const [frame, setFrame] = useState<TelemetryFrame>(EMPTY_TELEMETRY);

  useEffect(() => {
    let alive = true;
    glacier.telemetry
      .latest()
      .then((next) => {
        if (alive && next) setFrame(next);
      })
      .catch(() => {});
    const off = glacier.telemetry.subscribe((next) => setFrame(next));
    return () => {
      alive = false;
      off();
    };
  }, []);

  return frame;
}

/** Pausing, reusable interval clock. */
export function useNow(intervalMs = 1_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Persisted widget state, stored by Rust under `%APPDATA%\GlacierDock\widgets`. */
export function useWidgetStorage<T>(
  widgetId: string,
  key: string,
  initial: T,
): [T, (next: T | ((previous: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    glacier.storage
      .get<T>(widgetId, key)
      .then((stored) => {
        if (!alive) return;
        if (stored !== undefined && stored !== null) setValue(stored);
        loaded.current = true;
        setReady(true);
      })
      .catch(() => {
        loaded.current = true;
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [widgetId, key]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved =
          typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
        if (loaded.current) {
          glacier.storage.set(widgetId, key, resolved).catch(() => {});
        }
        return resolved;
      });
    },
    [widgetId, key],
  );

  return [value, update, ready];
}

/** Run an async task on mount and expose its result / error. */
export function useAsync<T>(
  task: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs?: number,
): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    let alive = true;
    const run = () => {
      taskRef
        .current()
        .then((result) => {
          if (!alive) return;
          setData(result);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };
    run();
    const id = intervalMs ? window.setInterval(run, intervalMs) : undefined;
    return () => {
      alive = false;
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
