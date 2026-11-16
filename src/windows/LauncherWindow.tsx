import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useAppIcon } from "../sdk/hooks";
import {
  CATEGORIES,
  appHue,
  categorize,
  initials,
  searchApps,
  type Category,
  type InstalledApp,
  type PinnedApp,
} from "../utils/apps";

async function hideSelf() {
  try {
    await getCurrentWindow().hide();
  } catch {
    /* browser preview */
  }
}

/** Shell icon with the initial-tile fallback, sized by the parent. */
function AppGlyph({ app, rounded }: { app: InstalledApp; rounded?: string }) {
  const icon = useAppIcon(app.path);
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        draggable={false}
        className={`size-full select-none object-contain ${rounded ?? "rounded-md"}`}
      />
    );
  }
  return (
    <span
      className={`grid size-full place-items-center text-[8px] font-bold ${rounded ?? "rounded-md"}`}
      style={{ background: `hsl(${appHue(app.name)} 70% 52% / 0.85)`, color: "#08111d" }}
    >
      {initials(app.name)}
    </span>
  );
}

/**
 * Categorized Start app library: instant fuzzy search plus category cards with
 * `2 x 2` nested icon previews.
 */
export default function LauncherWindow() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [pinned, setPinned] = useState<PinnedApp[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Category | null>(null);

  useEffect(() => {
    invoke<InstalledApp[]>("installed_apps", { limit: 500 })
      .then(setApps)
      .catch(() => setApps([]));
    invoke<PinnedApp[]>("pinned_apps")
      .then(setPinned)
      .catch(() => setPinned([]));
  }, []);

  const togglePin = async (app: InstalledApp) => {
    const already = pinned.some((entry) => entry.path === app.path);
    const next = already
      ? pinned.filter((entry) => entry.path !== app.path)
      : [...pinned, { name: app.name, path: app.path }];
    setPinned(next);
    try {
      await invoke("set_pinned_apps", { apps: next });
    } catch {
      /* the dock keeps its previous contents */
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<Category, InstalledApp[]>();
    for (const category of CATEGORIES) map.set(category, []);
    for (const app of apps) map.get(categorize(app))?.push(app);
    return map;
  }, [apps]);

  const results = useMemo(() => searchApps(apps, query, 60), [apps, query]);
  const list = query.trim() ? results : selected ? (grouped.get(selected) ?? []) : [];

  const launch = async (app: InstalledApp) => {
    try {
      await invoke("launch_app", { path: app.path });
      await hideSelf();
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl backdrop-blur-2xl"
      style={{ background: "var(--glacier-elevated)", boxShadow: "var(--glacier-shadow)" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (selected) setSelected(null);
          else hideSelf();
        }
      }}
      tabIndex={-1}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        {selected && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="rounded-full bg-white/10 px-2 py-1 text-[10px]"
          >
            ← Back
          </button>
        )}
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for apps, settings, and documents"
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:opacity-45"
        />
        <button
          type="button"
          onClick={hideSelf}
          className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] opacity-80 hover:opacity-100"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!query.trim() && !selected && (
          <>
            <div className="mb-2 text-[10px] uppercase tracking-widest opacity-40">
              View: Category
            </div>
            <div className="grid grid-cols-3 gap-3">
              {CATEGORIES.map((category) => {
                const items = grouped.get(category) ?? [];
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelected(category)}
                    className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      {items.slice(0, 4).map((app) => (
                        <span key={app.path} className="grid aspect-square place-items-center">
                          <AppGlyph app={app} />
                        </span>
                      ))}
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-semibold">{category}</span>
                      <span className="text-[9px] opacity-50">{items.length}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {(query.trim() || selected) && (
          <div className="grid grid-cols-6 gap-3">
            {list.map((app) => {
              const isPinned = pinned.some((entry) => entry.path === app.path);
              return (
                <div key={app.path} className="group relative">
                  <button
                    type="button"
                    onClick={() => launch(app)}
                    title={app.name}
                    className="flex w-full flex-col items-center gap-1.5 rounded-lg p-1.5 hover:bg-white/10"
                  >
                    <span className="grid size-10 place-items-center">
                      <AppGlyph app={app} rounded="rounded-lg" />
                    </span>
                    <span className="w-full truncate text-center text-[9px] leading-tight opacity-80">
                      {app.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(app)}
                    title={isPinned ? "Remove from dock" : "Pin to dock"}
                    className={`absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full text-[9px] leading-none ring-1 ring-black/30 transition-opacity ${
                      isPinned
                        ? "bg-[var(--glacier-accent)] text-black"
                        : "bg-white/20 text-white opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {isPinned ? "✓" : "+"}
                  </button>
                </div>
              );
            })}
            {list.length === 0 && (
              <div className="col-span-6 py-10 text-center text-xs opacity-50">
                Nothing matches “{query}”.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
