import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { evaluateExpression } from "../utils/expression";
import { appHue, initials, searchApps, type InstalledApp } from "../utils/apps";

interface Action {
  id: string;
  title: string;
  subtitle: string;
  run: () => void | Promise<void>;
  glyph: string;
}

async function hideSelf() {
  try {
    await getCurrentWindow().hide();
  } catch {
    /* browser preview */
  }
}

/**
 * Universal command palette: apps, inline calculator, and dock actions.
 * Summoned with `Alt + Space` (registered in Rust) or the dock's launcher pill.
 */
export default function SpotlightWindow() {
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    invoke<InstalledApp[]>("installed_apps", { limit: 400 })
      .then(setApps)
      .catch(() => setApps([]));

    const onFocus = () => inputRef.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => setSelected(0), [query]);

  const actions = useMemo<Action[]>(
    () => [
      {
        id: "launcher",
        title: "Open App Library",
        subtitle: "Glacier Launchpad",
        glyph: "▦",
        run: async () => {
          await invoke("open_launcher");
          await hideSelf();
        },
      },
      {
        id: "restore-taskbar",
        title: "Restore Windows taskbar",
        subtitle: "Maintenance",
        glyph: "▭",
        run: async () => {
          await invoke("restore_native_taskbar");
          await hideSelf();
        },
      },
    ],
    [],
  );

  const matchedActions = useMemo(
    () =>
      actions.filter((action) =>
        action.title.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [actions, query],
  );

  const matchedApps = useMemo(() => searchApps(apps, query, 8), [apps, query]);
  const math = useMemo(() => evaluateExpression(query), [query]);

  const launch = async (app: InstalledApp) => {
    try {
      await invoke("launch_app", { path: app.path });
      await hideSelf();
    } catch (err) {
      setError(String(err));
    }
  };

  const total = matchedApps.length + matchedActions.length;

  const onKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      await hideSelf();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((value) => (total === 0 ? 0 : (value + 1) % total));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((value) => (total === 0 ? 0 : (value - 1 + total) % total));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (query.startsWith("=") && math !== null) {
        setQuery(String(math));
        return;
      }
      if (selected < matchedApps.length) {
        await launch(matchedApps[selected]);
        return;
      }
      const action = matchedActions[selected - matchedApps.length];
      await action?.run();
    }
  };

  return (
    <div className="grid h-full w-full place-items-start p-2">
      <div className="glacier-dock-glass relative w-full overflow-hidden rounded-[18px]">
        <span className="glacier-dock-sheen" aria-hidden />
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="text-sm opacity-60">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search for apps, settings, documents — or type = 1450 * 0.18"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:opacity-45"
          />
          <kbd className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] opacity-70">
            Esc
          </kbd>
        </div>

        {(math !== null || error) && (
          <div className="border-t border-white/10 px-3 py-2 text-xs">
            {math !== null ? (
              <span className="tabular-nums opacity-90">
                = <strong className="font-semibold">{math}</strong>
              </span>
            ) : (
              <span className="text-red-300">{error}</span>
            )}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto border-t border-white/10 py-1">
          {matchedApps.map((app, index) => (
            <button
              key={app.path}
              type="button"
              onPointerEnter={() => setSelected(index)}
              onClick={() => launch(app)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
              style={{ background: index === selected ? "rgba(56,189,248,0.16)" : "transparent" }}
            >
              <span
                className="grid size-7 place-items-center rounded-md text-[9px] font-bold"
                style={{
                  background: `hsl(${appHue(app.name)} 70% 52% / 0.9)`,
                  color: "#08111d",
                }}
              >
                {initials(app.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{app.name}</span>
              <span className="shrink-0 text-[9px] uppercase opacity-40">App</span>
            </button>
          ))}

          {matchedActions.map((action, index) => {
            const absolute = matchedApps.length + index;
            return (
              <button
                key={action.id}
                type="button"
                onPointerEnter={() => setSelected(absolute)}
                onClick={() => action.run()}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left"
                style={{
                  background: absolute === selected ? "rgba(56,189,248,0.16)" : "transparent",
                }}
              >
                <span className="grid size-7 place-items-center rounded-md bg-white/10 text-[11px]">
                  {action.glyph}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{action.title}</span>
                <span className="shrink-0 text-[9px] uppercase opacity-40">
                  {action.subtitle}
                </span>
              </button>
            );
          })}

          {total === 0 && math === null && (
            <div className="px-3 py-6 text-center text-xs opacity-50">No results</div>
          )}
        </div>
      </div>
    </div>
  );
}
