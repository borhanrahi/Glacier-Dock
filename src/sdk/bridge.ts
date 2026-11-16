/**
 * Glacier SDK bridge — `window.glacier` (and the `window.dockhub` alias kept for
 * widgets written against the original blueprint naming).
 *
 * Widgets never call `invoke` themselves: the bridge is the only place that
 * knows command names, so a future WASM sandbox can swap the transport.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";

export interface TelemetryFrame {
  seq: number;
  timestampMs: number;
  uptimeSecs: number;
  cpuPercent: number;
  cpuUserPercent: number;
  cpuKernelPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramPercent: number;
  commitUsedMb: number;
  diskFreeGb: number;
  diskTotalGb: number;
  netDownBps: number;
  netUpBps: number;
  batteryPercent: number | null;
  batteryCharging: boolean;
  batterySecondsLeft: number | null;
  topProcess: {
    pid: number;
    name: string;
    cpuPercent: number;
    ramMb: number;
  } | null;
  gpuPercent: number | null;
  temperatureC: number | null;
}

export interface NetworkInterface {
  alias: string;
  description: string;
  up: boolean;
  loopback: boolean;
  kind: "wifi" | "ethernet" | "loopback" | "other" | string;
  speedBps: number;
  rxBytes: number;
  txBytes: number;
}

export interface InstalledWidget {
  id: string;
  name: string;
  category: string;
  version: string;
  author: string;
  description: string;
  bundled: boolean;
  feed?: string | null;
  manifestUrl?: string | null;
  installedAtMs?: number;
}

export interface AppConfig {
  replaceTaskbar: boolean;
  appearance: Record<string, unknown>;
  automations: Record<string, boolean>;
  telemetry: { enabled: boolean; intervalMs: number; topProcess: boolean; network: boolean };
  advanced: {
    hardwareAcceleration: boolean;
    startWithWindows: boolean;
    checkUpdates: boolean;
    storeUrl: string;
    flyoutLingerMs: number;
  };
  latitude: number;
  longitude: number;
  activeProfile: string;
  [key: string]: unknown;
}

export type WidgetKind = "message" | "hardware" | "download" | "timer";

const SDK_VERSION = "1.0.0";
const TELEMETRY_EVENT = "glacier://telemetry";

function platform(): "windows" | "macos" | "linux" | "web" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "web";
}

function query(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

const storageCache = new Map<string, Record<string, unknown>>();

async function readStorage(id: string): Promise<Record<string, unknown>> {
  const cached = storageCache.get(id);
  if (cached) return cached;
  try {
    const value = await invoke<Record<string, unknown>>("widget_storage_get", { id });
    const doc = value && typeof value === "object" ? value : {};
    storageCache.set(id, doc);
    return doc;
  } catch {
    const empty = {};
    storageCache.set(id, empty);
    return empty;
  }
}

async function writeStorage(id: string, doc: Record<string, unknown>) {
  storageCache.set(id, doc);
  try {
    await invoke("widget_storage_set", { id, value: doc });
  } catch {
    // A widget must keep working in the browser preview where no backend exists.
  }
}

export interface GlacierSDK {
  readonly version: string;
  readonly platform: "windows" | "macos" | "linux" | "web";
  readonly widget: { id: string | null };
  telemetry: {
    latest(): Promise<TelemetryFrame>;
    subscribe(listener: (frame: TelemetryFrame) => void): () => void;
  };
  storage: {
    all<T = Record<string, unknown>>(id: string): Promise<T>;
    get<T = unknown>(id: string, key: string): Promise<T | undefined>;
    set(id: string, key: string, value: unknown): Promise<void>;
    remove(id: string, key: string): Promise<void>;
  };
  store: {
    installed(): Promise<InstalledWidget[]>;
    install(manifest: Partial<InstalledWidget> & { id: string; name: string }): Promise<InstalledWidget>;
    installFromUrl(url: string): Promise<InstalledWidget>;
    uninstall(id: string): Promise<void>;
    index(): Promise<unknown[]>;
    refresh(url?: string): Promise<unknown[]>;
  };
  system: {
    apps(limit?: number): Promise<Array<{ name: string; path: string }>>;
    launch(path: string): Promise<void>;
    openPath(path: string): Promise<void>;
    openSettings(): Promise<void>;
    spotlight(): Promise<void>;
    launcher(): Promise<void>;
    taskManager(): Promise<void>;
    openWidget(id: string, size?: { width?: number; height?: number }): Promise<void>;
    hide(): Promise<void>;
    networkInterfaces(): Promise<NetworkInterface[]>;
    listeningPorts(): Promise<Array<{ port: number; process: string; pid: number }>>;
    ping(host: string, port?: number, timeoutMs?: number): Promise<number>;
    resolve(host: string): Promise<string[]>;
    fetchText(url: string): Promise<string>;
    telemetry(): Promise<TelemetryFrame>;
  };
  config: {
    get(): Promise<AppConfig>;
    save(config: AppConfig): Promise<void>;
  };
  notify(title: string, body: string, kind?: WidgetKind): Promise<void>;
  on<T = unknown>(channel: string, listener: (payload: T) => void): () => void;
}

async function ensureInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export const glacier: GlacierSDK = {
  version: SDK_VERSION,
  platform: platform(),
  widget: { id: query("widget") },

  telemetry: {
    latest: () => invoke<TelemetryFrame>("telemetry_snapshot"),
    subscribe(listener) {
      let alive = true;
      let unlisten: UnlistenFn | undefined;
      listen<TelemetryFrame>(TELEMETRY_EVENT, (event: Event<TelemetryFrame>) => {
        if (alive) listener(event.payload);
      })
        .then((fn) => {
          if (!alive) fn();
          else unlisten = fn;
        })
        .catch(() => {});
      return () => {
        alive = false;
        unlisten?.();
      };
    },
  },

  storage: {
    all: (id) => readStorage(id) as Promise<never>,
    async get<T>(id: string, key: string) {
      const doc = await readStorage(id);
      return doc[key] as T | undefined;
    },
    async set(id, key, value) {
      const doc = await readStorage(id);
      await writeStorage(id, { ...doc, [key]: value });
    },
    async remove(id, key) {
      const doc = await readStorage(id);
      const next = { ...doc };
      delete next[key];
      await writeStorage(id, next);
    },
  },

  store: {
    installed: () => invoke<InstalledWidget[]>("store_installed"),
    install: (manifest) => invoke<InstalledWidget>("store_install", { package: manifest }),
    installFromUrl: (url) => invoke<InstalledWidget>("store_install_url", { url }),
    uninstall: (id) => invoke("store_uninstall", { id }),
    index: () => invoke<unknown[]>("store_index"),
    refresh: (url) => invoke<unknown[]>("store_refresh", { url }),
  },

  system: {
    apps: (limit = 400) => invoke("installed_apps", { limit }),
    launch: (path) => invoke("launch_app", { path }),
    openPath: (path) => invoke("open_path", { path }),
    openSettings: () => invoke("open_settings"),
    spotlight: () => invoke("open_spotlight"),
    launcher: () => invoke("open_launcher"),
    taskManager: () => invoke("task_manager"),
    openWidget: (id, size) =>
      invoke("open_widget", {
        id,
        width: size?.width ?? null,
        height: size?.height ?? null,
      }),
    hide: () => invoke("hide_window"),
    networkInterfaces: () => invoke<NetworkInterface[]>("network_interfaces"),
    listeningPorts: () => invoke("listening_ports"),
    ping: (host, port, timeoutMs) =>
      invoke<number>("ping_host", { host, port: port ?? null, timeoutMs: timeoutMs ?? null }),
    resolve: (host) => invoke<string[]>("resolve_host", { host }),
    fetchText: (url) => invoke<string>("fetch_text", { url }),
    telemetry: () => invoke<TelemetryFrame>("telemetry_snapshot"),
  },

  config: {
    get: () => invoke<AppConfig>("get_config"),
    save: (cfg) => invoke("save_config", { cfg }),
  },

  notify: (title, body, kind = "message") =>
    ensureInvoke("notify", { title, body, kind }),

  on<T>(channel: string, listener: (payload: T) => void) {
    let alive = true;
    let unlisten: UnlistenFn | undefined;
    listen<T>(channel, (event) => {
      if (alive) listener(event.payload);
    })
      .then((fn) => {
        if (!alive) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
    };
  },
};

declare global {
  interface Window {
    glacier: GlacierSDK;
    dockhub: GlacierSDK;
  }
}

if (typeof window !== "undefined") {
  window.glacier = glacier;
  window.dockhub = glacier;
}

export default glacier;
