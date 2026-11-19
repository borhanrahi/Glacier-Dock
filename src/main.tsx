import {
  StrictMode,
  Suspense,
  lazy,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "./styles/glacier-tokens.css";

/**
 * Window label router.
 * Tauri opens every window as its own webview; the label decides which React
 * root renders. Windows are lazily imported so unused ones cost nothing.
 */
const DockWindow = lazy(() => import("./windows/DockWindow"));
const SpotlightWindow = lazy(() => import("./windows/SpotlightWindow"));
const LauncherWindow = lazy(() => import("./windows/LauncherWindow"));
const TaskManagerWindow = lazy(() => import("./windows/TaskManagerWindow"));
const PreviewWindow = lazy(() => import("./windows/PreviewWindow"));
const SettingsWindow = lazy(() => import("./windows/SettingsWindow"));
const WidgetFlyoutWindow = lazy(() => import("./windows/WidgetFlyoutWindow"));
const HiddenAppsWindow = lazy(() => import("./windows/HiddenAppsWindow"));
const WidgetGalleryWindow = lazy(() => import("./windows/WidgetGalleryWindow"));
const TerminalWindow = lazy(() => import("./windows/TerminalWindow"));

/** Docks are created per display as `dock-0`, `dock-1`, … */
function resolveWindow(label: string): LazyExoticComponent<ComponentType> | null {
  if (label.startsWith("dock")) return DockWindow;
  if (label === "spotlight") return SpotlightWindow;
  if (label === "launcher") return LauncherWindow;
  if (label === "task-manager") return TaskManagerWindow;
  if (label === "preview") return PreviewWindow;
  if (label === "settings") return SettingsWindow;
  if (label === "widget-flyout") return WidgetFlyoutWindow;
  if (label === "hidden-apps") return HiddenAppsWindow;
  if (label === "widget-gallery") return WidgetGalleryWindow;
  if (label === "terminal") return TerminalWindow;
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
    <MotionConfig reducedMotion="user">
      <Suspense fallback={null}>
        {WindowRoot ? <WindowRoot /> : <UnknownWindow label={label} />}
      </Suspense>
    </MotionConfig>
  </StrictMode>,
);

function UnknownWindow({ label: unknownLabel }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-[var(--glacier-text-muted)]">
      No window registered for label “{unknownLabel}”.
    </div>
  );
}
