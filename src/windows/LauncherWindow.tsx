import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Plus, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useAppIcon } from "../sdk/hooks";
import { MAC_MODAL_SPRING, useWindowMotion } from "../sdk/motion";
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

type FilterTab = "all" | "pinned" | Category;

async function hideSelf() {
  try {
    await getCurrentWindow().hide();
  } catch {
    /* browser preview */
  }
}

/** Crisp shell icon with initial-tile fallback. */
function AppGlyph({ app }: { app: InstalledApp }) {
  const icon = useAppIcon(app.path);
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        draggable={false}
        className="size-10 select-none rounded-lg object-contain"
      />
    );
  }
  return (
    <span
      className="grid size-10 place-items-center rounded-xl text-[12px] font-bold"
      style={{ background: `hsl(${appHue(app.name)} 70% 52% / 0.9)`, color: "#08111d" }}
    >
      {initials(app.name)}
    </span>
  );
}

/**
 * Modern Launchpad / App Library: category filter pills, live search, keyboard
 * grid navigation, and crisp high-DPI icons.
 */
export default function LauncherWindow() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [pinned, setPinned] = useState<PinnedApp[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showSeq, visible, dismiss } = useWindowMotion();

  useEffect(() => {
    invoke<InstalledApp[]>("installed_apps", { limit: 500 })
      .then(setApps)
      .catch(() => setApps([]));
    invoke<PinnedApp[]>("pinned_apps")
      .then(setPinned)
      .catch(() => setPinned([]));

    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    setActiveIdx(0);
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [showSeq]);

  const togglePin = async (app: InstalledApp) => {
    const already = pinned.some((entry) => entry.path.toLowerCase() === app.path.toLowerCase());
    const next = already
      ? pinned.filter((entry) => entry.path.toLowerCase() !== app.path.toLowerCase())
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

  const nonEmptyCategories = useMemo(
    () => CATEGORIES.filter((category) => (grouped.get(category)?.length ?? 0) > 0),
    [grouped],
  );

  const pinnedSet = useMemo(
    () => new Set(pinned.map((entry) => entry.path.toLowerCase())),
    [pinned],
  );

  const filtered = useMemo(() => {
    if (query.trim()) return searchApps(apps, query, 84);
    if (filter === "all") return apps;
    if (filter === "pinned") {
      return apps.filter((app) => pinnedSet.has(app.path.toLowerCase()));
    }
    return grouped.get(filter) ?? [];
  }, [apps, query, filter, pinnedSet, grouped]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, filter]);

  const launch = async (app: InstalledApp) => {
    try {
      await invoke("launch_app", { path: app.path });
      await hideSelf();
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query.trim()) setQuery("");
      else dismiss();
      return;
    }
    if (filtered.length === 0) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 6));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 6));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = filtered[activeIdx];
      if (target) void launch(target);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={showSeq}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.09 } }}
          transition={MAC_MODAL_SPRING}
          onKeyDown={onKeyDown}
          tabIndex={-1}
          className="glacier-panel-glass relative flex h-full w-full flex-col overflow-hidden rounded-[20px] outline-none will-change-transform"
        >
          <span className="glacier-dock-sheen" aria-hidden />

          <div
            data-tauri-drag-region
            className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-3.5"
          >
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps…"
              className="h-7 flex-1 bg-transparent text-[13.5px] text-slate-100 outline-none placeholder:text-slate-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-300 hover:bg-white/[0.12]"
              >
                Clear
              </button>
            )}
            <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10.5px] font-medium tabular-nums text-slate-400">
              {filtered.length} apps
            </span>
            <button
              type="button"
              title="Close (Esc)"
              onClick={dismiss}
              className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/[0.14] hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {!query.trim() && (
            <div className="glacier-no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.05] px-5 py-2.5">
              {(
                [
                  { id: "all", label: "All", count: apps.length },
                  { id: "pinned", label: "Pinned", count: pinned.length },
                  ...nonEmptyCategories.map((cat) => ({
                    id: cat,
                    label: cat,
                    count: grouped.get(cat)?.length ?? 0,
                  })),
                ] as Array<{ id: FilterTab; label: string; count: number }>
              ).map((pill) => {
                const active = filter === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setFilter(pill.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] transition ${
                      active
                        ? "bg-sky-400/18 font-medium text-sky-200 ring-1 ring-sky-400/35"
                        : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span className={`text-[10px] tabular-nums ${active ? "text-sky-300/80" : "text-slate-500"}`}>
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {filtered.length === 0 ? (
              <div className="grid h-full place-items-center py-12 text-center text-xs text-slate-400">
                {query.trim() ? `Nothing matches “${query}”.` : "No apps in this view."}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2.5">
                {filtered.map((app, idx) => {
                  const isPinned = pinnedSet.has(app.path.toLowerCase());
                  const isFocused = idx === activeIdx;
                  return (
                    <div
                      key={app.path}
                      className={`group relative rounded-2xl border p-2.5 transition ${
                        isFocused
                          ? "border-sky-400/40 bg-white/[0.07]"
                          : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.055]"
                      }`}
                    >
                      <button
                        type="button"
                        onPointerEnter={() => setActiveIdx(idx)}
                        onClick={() => launch(app)}
                        title={app.name}
                        className="flex w-full flex-col items-center"
                      >
                        <span className="grid size-14 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06] transition-transform duration-150 group-hover:-translate-y-0.5">
                          <AppGlyph app={app} />
                        </span>
                        <span className="mt-1.5 line-clamp-2 h-7 w-full text-center text-[11px] font-medium leading-tight text-slate-200">
                          {app.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(app)}
                        title={isPinned ? "Unpin from dock" : "Pin to dock"}
                        className={`absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full transition ${
                          isPinned
                            ? "bg-sky-400 text-slate-950 shadow-sm"
                            : "bg-white/15 text-white opacity-0 hover:bg-white/25 group-hover:opacity-100"
                        }`}
                      >
                        {isPinned ? <Check className="size-3" /> : <Plus className="size-3" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
