/**
 * macOS-style parabolic fisheye magnification.
 *
 * Writes `--icon-scale` and `--icon-lift` directly onto each icon element from
 * a rAF loop, so a 120fps hover wave never triggers a React render.
 *
 *   s(d) = 1 + (sMax - 1) * cos²(π · min(|d|, R) / (2R))
 */

export interface FisheyeOptions {
  /** Peak scale, 1.28–1.35 per the design spec. */
  maxScale: number;
  /** Influence radius in CSS pixels. */
  radius: number;
  /** Axis the icons are laid out on. */
  orientation: "horizontal" | "vertical";
  /** Distance the nearest icon gets pushed away, in pixels. */
  displacement?: number;
}

const DEFAULTS: FisheyeOptions = {
  maxScale: 1.32,
  radius: 140,
  orientation: "horizontal",
  displacement: 10,
};

export function attachFisheye(
  container: HTMLElement,
  getIcons: () => HTMLElement[],
  options: Partial<FisheyeOptions> = {},
): () => void {
  const opts: FisheyeOptions = { ...DEFAULTS, ...options };
  let pointer: number | null = null;
  let frame = 0;
  let disposed = false;

  const reset = () => {
    for (const icon of getIcons()) {
      icon.style.setProperty("--icon-scale", "1");
      icon.style.setProperty("--icon-lift", "0px");
    }
  };

  const apply = () => {
    frame = 0;
    if (disposed) return;
    const icons = getIcons();
    if (pointer === null) {
      reset();
      return;
    }

    const horizontal = opts.orientation === "horizontal";
    for (const icon of icons) {
      const rect = icon.getBoundingClientRect();
      const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      const distance = Math.abs(pointer - center);
      const falloff = Math.min(distance, opts.radius) / (2 * opts.radius);
      const wave = Math.cos(Math.PI * falloff) ** 2;

      const scale = 1 + (opts.maxScale - 1) * wave;
      const lift = (opts.displacement ?? 0) * wave;
      icon.style.setProperty("--icon-scale", scale.toFixed(4));
      icon.style.setProperty("--icon-lift", `${lift.toFixed(2)}px`);
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  const onMove = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    pointer =
      opts.orientation === "horizontal" ? event.clientX - rect.left : event.clientY - rect.top;
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
    reset();
  };
}
