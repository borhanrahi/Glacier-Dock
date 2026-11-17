/**
 * macOS-style parabolic fisheye magnification with spring-damped smoothing
 * and horizontal neighbor spread.
 *
 * Writes `--icon-scale`, `--icon-lift`, and `--icon-spread` directly onto each
 * `[data-icon]` element from a rAF loop so 120fps hover waves never trigger
 * React re-renders.
 *
 *   s(d) = 1 + (sMax - 1) * cos²(π · min(|d|, R) / (2R))
 */

export interface FisheyeOptions {
  /** Peak scale, e.g. 1.45–1.55 for macOS-style magnification. */
  maxScale: number;
  /** Influence radius in CSS pixels. */
  radius: number;
  /** Axis the icons are laid out on. */
  orientation: "horizontal" | "vertical";
  /** Upward/outward lift at peak magnification, in pixels. */
  displacement?: number;
  /** Horizontal/vertical neighbor spread factor per unit of (scale - 1). */
  spread?: number;
}

const DEFAULTS: FisheyeOptions = {
  maxScale: 1.52,
  radius: 155,
  orientation: "horizontal",
  displacement: 10,
  spread: 18,
};

interface IconState {
  scale: number;
  lift: number;
}

export function attachFisheye(
  container: HTMLElement,
  getIcons: () => HTMLElement[],
  options: Partial<FisheyeOptions> = {},
): () => void {
  const opts: FisheyeOptions = { ...DEFAULTS, ...options };
  const states = new WeakMap<HTMLElement, IconState>();
  let pointer: number | null = null;
  let frame = 0;
  let disposed = false;

  const step = () => {
    frame = 0;
    if (disposed) return;
    const icons = getIcons();
    const horizontal = opts.orientation === "horizontal";
    const smoothing = pointer === null ? 0.2 : 0.28;
    const spreadFactor = opts.spread ?? 18;
    let moving = false;

    for (const icon of icons) {
      let targetScale = 1;
      let targetLift = 0;
      const rect = icon.getBoundingClientRect();
      const baseSpan = horizontal ? rect.width : rect.height;
      const dynamicSpread = Math.max(spreadFactor, baseSpan * 0.48);

      if (pointer !== null) {
        const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        const distance = Math.abs(pointer - center);
        if (distance < opts.radius) {
          const falloff = distance / (2 * opts.radius);
          const wave = Math.cos(Math.PI * falloff) ** 2;
          targetScale = 1 + (opts.maxScale - 1) * wave;
          targetLift = (opts.displacement ?? 0) * wave;
        }
      }

      const prev = states.get(icon) ?? { scale: 1, lift: 0 };
      const nextScale = prev.scale + (targetScale - prev.scale) * smoothing;
      const nextLift = prev.lift + (targetLift - prev.lift) * smoothing;

      if (Math.abs(targetScale - nextScale) > 0.001 || Math.abs(targetLift - nextLift) > 0.02) {
        moving = true;
        states.set(icon, { scale: nextScale, lift: nextLift });
        icon.style.setProperty("--icon-scale", nextScale.toFixed(4));
        icon.style.setProperty("--icon-lift", `${nextLift.toFixed(2)}px`);
        icon.style.setProperty(
          "--icon-spread",
          `${((nextScale - 1) * dynamicSpread).toFixed(2)}px`,
        );
      } else {
        states.set(icon, { scale: targetScale, lift: targetLift });
        icon.style.setProperty("--icon-scale", targetScale.toFixed(4));
        icon.style.setProperty("--icon-lift", `${targetLift.toFixed(2)}px`);
        icon.style.setProperty(
          "--icon-spread",
          `${((targetScale - 1) * dynamicSpread).toFixed(2)}px`,
        );
      }
    }

    if (moving) {
      schedule();
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  const onMove = (event: PointerEvent) => {
    pointer = opts.orientation === "horizontal" ? event.clientX : event.clientY;
    schedule();
  };

  const onLeave = () => {
    pointer = null;
    schedule();
  };

  container.addEventListener("pointermove", onMove);
  container.addEventListener("pointerleave", onLeave);

  return () => {
    disposed = true;
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerleave", onLeave);
    if (frame) cancelAnimationFrame(frame);
  };
}
