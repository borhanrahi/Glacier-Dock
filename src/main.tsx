import {
  StrictMode,
  Suspense,
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { createRoot } from "react-dom/client";
import "./styles/glacier-tokens.css";

/**
 * Window label router.
 * Tauri opens every window as its own webview; the label decides which React
 * root renders. Windows are lazily imported so unused ones cost nothing.
 */
const DockWindow = lazy(() => import("./windows/DockWindow"));
const SpotlightWindow = lazy(() => import("./windows/SpotlightWindow"));
const LauncherWindow = lazy(() => import("./windows/LauncherWindow"));

/** Docks are created per display as `dock-0`, `dock-1`, … */
function resolveWindow(label: string): LazyExoticComponent<ComponentType> | null {
  if (label.startsWith("dock")) return DockWindow;
  if (label === "spotlight") return SpotlightWindow;
  if (label === "launcher") return LauncherWindow;
  return null;
}

function currentLabel(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("win") ?? params.get("dock");
  if (fromQuery) return fromQuery;
  try {
    const internals = (window as unknown as Record<string, any>).__TAURI_INTERNALS__;
    return internals?.metadata?.currentWindow?.label ?? "dock";
  } catch {
    return "dock";
  }
}

const label = currentLabel();
const WindowRoot = resolveWindow(label);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Suspense fallback={null}>
      {WindowRoot ? <WindowRoot /> : <UnknownWindow label={label} />}
    </Suspense>
  </StrictMode>,
);

function UnknownWindow({ label: unknownLabel }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-[var(--glacier-text-muted)]">
      No window registered for label “{unknownLabel}”.
    </div>
  );
}
