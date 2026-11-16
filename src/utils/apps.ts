import { invoke } from "@tauri-apps/api/core";

export interface InstalledApp {
  name: string;
  path: string;
}

/** An app the user pinned to the dock, in order. */
export interface PinnedApp {
  name: string;
  path: string;
}

const iconCache = new Map<string, string | null>();
const iconPending = new Map<string, Promise<string | null>>();

/**
 * Shell icon for a shortcut as a PNG data URL, cached per path. Resolves to
 * `null` when the shell has no icon (or outside the desktop app); callers fall
 * back to initial tiles.
 */
export function loadAppIcon(path: string): Promise<string | null> {
  if (iconCache.has(path)) return Promise.resolve(iconCache.get(path) ?? null);
  const pending = iconPending.get(path);
  if (pending) return pending;

  const request = invoke<string | null>("app_icon", { path })
    .then((icon) => {
      iconCache.set(path, icon);
      return icon;
    })
    .catch(() => {
      iconCache.set(path, null);
      return null;
    })
    .finally(() => iconPending.delete(path));

  iconPending.set(path, request);
  return request;
}

export type Category =
  | "Productivity"
  | "Utilities & Tools"
  | "Games"
  | "Creativity"
  | "Developer Tools"
  | "Other";

export const CATEGORIES: Category[] = [
  "Productivity",
  "Utilities & Tools",
  "Games",
  "Creativity",
  "Developer Tools",
  "Other",
];

const KEYWORDS: Array<[Category, string[]]> = [
  [
    "Developer Tools",
    [
      "visual studio",
      "vs code",
      "code",
      "terminal",
      "powershell",
      "command prompt",
      "docker",
      "git",
      "postman",
      "android studio",
      "intellij",
      "pycharm",
      "webstorm",
      "sublime",
      "node",
      "python",
      "xampp",
      "laragon",
    ],
  ],
  [
    "Games",
    ["steam", "epic", "riot", "game", "xbox", "battle.net", "valorant", "minecraft", "roblox"],
  ],
  [
    "Creativity",
    ["photoshop", "illustrator", "figma", "premiere", "after effects", "blender", "canva", "audacity", "obs", "paint"],
  ],
  [
    "Productivity",
    ["word", "excel", "powerpoint", "outlook", "onenote", "teams", "notion", "slack", "todo", "calendar", "excel"],
  ],
  [
    "Utilities & Tools",
    [
      "settings",
      "control panel",
      "calculator",
      "snipping",
      "paint",
      "explorer",
      "file explorer",
      "task manager",
      "device manager",
      "disk",
      "antivirus",
      "7-zip",
      "winrar",
      "cmd",
    ],
  ],
];

export function categorize(app: InstalledApp): Category {
  const haystack = `${app.name} ${app.path}`.toLowerCase();
  for (const [category, words] of KEYWORDS) {
    if (words.some((word) => haystack.includes(word))) return category;
  }
  return "Other";
}

/**
 * Subsequence fuzzy match with a prefix and word-boundary bonus.
 * Returns `null` when the query does not match at all.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  const direct = t.indexOf(q);
  if (direct === 0) return 1000;
  if (direct > 0) return 700 - direct;

  let score = 0;
  let ti = 0;
  let previous = 0;
  for (const char of q) {
    const found = t.indexOf(char, ti);
    if (found === -1) return null;
    score += 10;
    if (found === 0 || t[found - 1] === " " || t[found - 1] === "-") score += 20;
    if (found === previous + 1) score += 5;
    previous = found;
    ti = found + 1;
  }
  return score;
}

export function searchApps(apps: InstalledApp[], query: string, limit = 8): InstalledApp[] {
  if (!query.trim()) return apps.slice(0, limit);
  return apps
    .map((app) => ({ app, score: fuzzyScore(query, app.name) }))
    .filter((entry): entry is { app: InstalledApp; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.app);
}

/** 8 folder accent swatches from the design spec. */
export const FOLDER_COLORS = [
  { name: "Blue", value: "#38BDF8" },
  { name: "Green", value: "#34D399" },
  { name: "Orange", value: "#FB923C" },
  { name: "Red", value: "#F87171" },
  { name: "Purple", value: "#A78BFA" },
  { name: "Teal", value: "#2DD4BF" },
  { name: "Pink", value: "#F472B6" },
  { name: "Yellow", value: "#FACC15" },
];

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable hue per app so tiles look intentional without icon extraction yet. */
export function appHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}
