/**
 * Dock-native Widgets section. Lists every installed widget with open / pin /
 * uninstall actions, plus the full catalog for one-click installs. Pin changes
 * are saved through `save_config`, which re-emits `glacier://config` so every
 * dock strip updates immediately without a restart.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";

import glacier, { type InstalledWidget } from "../sdk/bridge";
import { MAC_MODAL_SPRING, useWindowMotion } from "../sdk/motion";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  WIDGETS,
  searchWidgets,
  widgetMeta,
  type WidgetCategory,
} from "../widgets/registry";

interface GalleryConfig {
  dockWidgets?: string[];
  [key: string]: unknown;
}

export default function WidgetGalleryWindow() {
  const { showSeq, visible, dismiss } = useWindowMotion();
  const [installed, setInstalled] = useState<InstalledWidget[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WidgetCategory | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const reload = useCallback(() => {
    glacier.store
      .installed()
      .then((list) => setInstalled(Array.isArray(list) ? list : []))
      .catch(() => setInstalled([]));
    invoke<GalleryConfig>("get_config")
      .then((cfg) => setPinned(cfg?.dockWidgets ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    let unlisten: (() => void) | undefined;
    listen("glacier://window-show", reload)
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    let unlistenChanged: (() => void) | undefined;
    listen("glacier://widgets-changed", reload)
      .then((fn) => (unlistenChanged = fn))
      .catch(() => {});
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unlisten?.();
      unlistenChanged?.();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [reload, dismiss]);

  const installedIds = useMemo(() => new Set(installed.map((entry) => entry.id)), [installed]);
  const results = useMemo(() => {
    const base = query.trim() ? searchWidgets(query) : WIDGETS;
    return category === "all" ? base : base.filter((widget) => widget.category === category);
  }, [query, category]);

  const setDockWidgets = async (next: string[]) => {
    setPinned(next);
    try {
      const cfg = await invoke<GalleryConfig>("get_config");
      await invoke("save_config", { cfg: { ...cfg, dockWidgets: next } });
    } catch (error) {
      setMessage(String(error));
    }
  };

  const togglePin = (id: string) => {
    const next = pinned.includes(id) ? pinned.filter((entry) => entry !== id) : [...pinned, id].slice(-8);
    void setDockWidgets(next);
  };

  const open = (id: string) => {
    const meta = widgetMeta(id);
    invoke("open_widget", {
      id,
      width: meta?.width ?? 300,
      height: meta?.height ?? 210,
    }).catch((error) => setMessage(String(error)));
  };

  const install = async (id: string) => {
    const meta = widgetMeta(id);
    if (!meta) return;
    setBusy(id);
    try {
      await glacier.store.install({
        id: meta.id,
        name: meta.name,
        category: meta.category,
        version: "1.0.0",
        author: "Glacier Dock",
        description: meta.description,
        bundled: true,
      });
      setMessage(`Installed ${meta.name}`);
      reload();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (id: string) => {
    setBusy(id);
    try {
      await glacier.store.uninstall(id);
      if (pinned.includes(id)) {
        await setDockWidgets(pinned.filter((entry) => entry !== id));
      }
      setMessage(`Removed ${widgetMeta(id)?.name ?? id}`);
      reload();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(null);
    }
  };

  const glyph = (id: string, fallbackCategory: string) => {
    const meta = widgetMeta(id);
    const key = meta?.category ?? fallbackCategory;
    return CATEGORY_META[key as WidgetCategory]?.glyph ?? "✦";
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={showSeq}
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.1 } }}
          transition={MAC_MODAL_SPRING}
          className="relative h-full w-full will-change-transform"
        >
          <div className="glacier-dock-glass relative flex h-full w-full flex-col overflow-hidden rounded-2xl text-[var(--glacier-text)]">
            <span className="glacier-dock-sheen" aria-hidden />
            <header className="relative flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-[var(--glacier-accent)]/20 text-base">
                  ▦
                </span>
                <div className="leading-tight">
                  <h1 className="text-[13px] font-semibold tracking-wide">Widgets</h1>
                  <p className="text-[10px] opacity-55">
                    {installed.length} installed · {pinned.length} on the dock · {WIDGETS.length} available
                  </p>
                </div>
              </div>
              <button
                type="button"
                title="Close"
                onClick={dismiss}
                className="grid size-6 place-items-center rounded-full bg-white/10 text-[11px] transition-colors hover:bg-white/20"
              >
                ×
              </button>
            </header>

            <div className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              <section>
                <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--glacier-text-muted)]">
                  Installed widgets
                </h2>
                {installed.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] opacity-50">
                    Nothing installed yet. Pick a widget from the catalog below or install one from Settings.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {installed.map((widget) => (
                      <div
                        key={widget.id}
                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.04] p-2.5"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--glacier-accent)]/15 text-sm">
                          {glyph(widget.id, widget.category)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold">{widget.name}</p>
                          <p className="truncate text-[9px] opacity-50">
                            {CATEGORY_META[widget.category as WidgetCategory]?.label ?? widget.category}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" title="Open" onClick={() => open(widget.id)} className="rounded bg-white/10 px-1.5 py-1 text-[9px] hover:bg-white/20">
                            open
                          </button>
                          <button
                            type="button"
                            title={pinned.includes(widget.id) ? "Remove from dock" : "Pin to dock"}
                            onClick={() => togglePin(widget.id)}
                            className={`rounded px-1.5 py-1 text-[9px] ${pinned.includes(widget.id) ? "bg-[var(--glacier-accent)]/30" : "bg-white/10 hover:bg-white/20"}`}
                          >
                            {pinned.includes(widget.id) ? "pinned" : "pin"}
                          </button>
                          <button
                            type="button"
                            title="Uninstall"
                            disabled={busy === widget.id}
                            onClick={() => uninstall(widget.id)}
                            className="rounded bg-rose-500/15 px-1.5 py-1 text-[9px] text-rose-200 hover:bg-rose-500/30 disabled:opacity-40"
                          >
                            remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--glacier-text-muted)]">
                    Catalog
                  </h2>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search widgets…"
                    className="ml-auto w-40 rounded-lg border border-white/[0.08] bg-black/20 px-2 py-1 text-[10px] outline-none placeholder:opacity-40 focus:border-[var(--glacier-accent)]"
                  />
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as WidgetCategory | "all")}
                    className="rounded-lg border border-white/[0.08] bg-[#0b101b] px-2 py-1 text-[10px] outline-none"
                  >
                    <option value="all">All</option>
                    {CATEGORY_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {CATEGORY_META[key].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {results.map((widget) => {
                    const isInstalled = installedIds.has(widget.id);
                    return (
                      <div
                        key={widget.id}
                        className="flex flex-col gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{CATEGORY_META[widget.category].glyph}</span>
                          <span className="truncate text-[10px] font-semibold">{widget.name}</span>
                        </div>
                        <p className="line-clamp-2 min-h-[24px] text-[9px] leading-snug opacity-50">
                          {widget.description}
                        </p>
                        <div className="mt-auto flex gap-1">
                          <button type="button" onClick={() => open(widget.id)} className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] hover:bg-white/20">
                            open
                          </button>
                          {isInstalled && (
                            <button type="button" onClick={() => togglePin(widget.id)} className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] hover:bg-white/20">
                              {pinned.includes(widget.id) ? "unpin" : "pin"}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isInstalled || busy === widget.id}
                            onClick={() => install(widget.id)}
                            className="ml-auto rounded bg-[var(--glacier-accent)] px-1.5 py-0.5 text-[9px] font-semibold text-slate-950 disabled:opacity-35"
                          >
                            {isInstalled ? "installed" : "install"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <footer className="relative border-t border-white/[0.08] px-4 py-2 text-[10px] opacity-55">
              {message || "Tip: pin a widget to keep it one click away on the dock."}
            </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
