import { StrictMode, Suspense, lazy, type ComponentType, type LazyExoticComponent } from "react";
import { createRoot } from "react-dom/client";
import "./styles/glacier-tokens.css";

/**
 * Window label router.
 * Tauri opens every window as its own webview; the label decides which React
 * root renders. Windows are lazily imported so unused ones cost nothing.
 */
const windows: Record<string, LazyExoticComponent<ComponentType>> = {
  dock: lazy(() => import("./windows/DockWindow")),
};

function currentLabel(): string {
  try {
    // Present only inside a Tauri webview; falls back to "dock" in a browser.
    const internals = (window as unknown as Record<string, any>).__TAURI_INTERNALS__;
    return internals?.metadata?.currentWindow?.label ?? "dock";
  } catch {
    return "dock";
  }
}

const label = currentLabel();
const WindowRoot = windows[label];

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
