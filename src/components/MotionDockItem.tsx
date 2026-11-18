import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useSpring, useTransform, type MotionValue } from "motion/react";

import { MAC_DOCK_SPRING, MAC_TOOLTIP_SPRING } from "../sdk/motion";

export type DockEdge = "bottom" | "top" | "left" | "right";

export interface MotionDockItemProps {
  mouseAxis: MotionValue<number>;
  baseSize: number;
  maxScale: number;
  edge?: DockEdge;
  vertical?: boolean;
  variant?: "square" | "pill";
  iconRatio?: number;
  radius?: number;
  running?: boolean;
  tip?: string;
  ariaLabel?: string;
  bouncing?: boolean;
  appIcon?: boolean;
  noDrag?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLButtonElement>) => void;
}

/** Smooth C1 raised-cosine magnification curve peaking at d = 0 and tapering to 0 at ±radius. */
function waveAt(d: number, radius: number): number {
  if (!Number.isFinite(d) || Math.abs(d) >= radius) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * d) / radius));
}

const TOOLTIP_MOTION: Record<
  DockEdge,
  {
    posClass: string;
    initial: { opacity: number; x?: number | string; y?: number | string; scale: number };
    animate: { opacity: number; x?: number | string; y?: number | string; scale: number };
    exit: { opacity: number; x?: number | string; y?: number | string; scale: number };
  }
> = {
  bottom: {
    posClass: "-top-8 left-1/2",
    initial: { opacity: 0, y: 8, x: "-50%", scale: 0.92 },
    animate: { opacity: 1, y: 0, x: "-50%", scale: 1 },
    exit: { opacity: 0, y: 3, x: "-50%", scale: 0.96 },
  },
  top: {
    posClass: "-bottom-8 left-1/2",
    initial: { opacity: 0, y: -8, x: "-50%", scale: 0.92 },
    animate: { opacity: 1, y: 0, x: "-50%", scale: 1 },
    exit: { opacity: 0, y: -3, x: "-50%", scale: 0.96 },
  },
  left: {
    posClass: "left-full top-1/2 ml-2.5",
    initial: { opacity: 0, x: -8, y: "-50%", scale: 0.92 },
    animate: { opacity: 1, x: 0, y: "-50%", scale: 1 },
    exit: { opacity: 0, x: -3, y: "-50%", scale: 0.96 },
  },
  right: {
    posClass: "right-full top-1/2 mr-2.5",
    initial: { opacity: 0, x: 8, y: "-50%", scale: 0.92 },
    animate: { opacity: 1, x: 0, y: "-50%", scale: 1 },
    exit: { opacity: 0, x: 3, y: "-50%", scale: 0.96 },
  },
};

const RUNNING_DOT_CLASS: Record<DockEdge, string> = {
  bottom: "-bottom-1 left-1/2 h-[3px] w-3 -translate-x-1/2",
  top: "-top-1 left-1/2 h-[3px] w-3 -translate-x-1/2",
  left: "-left-1 top-1/2 h-3 w-[3px] -translate-y-1/2",
  right: "-right-1 top-1/2 h-3 w-[3px] -translate-y-1/2",
};

/**
 * Aceternity UI Floating Dock item with dual-spring box + inner icon expansion.
 * Expands via layout `width`/`height` anchored to the dock edge so neighbors
 * smoothly part instead of overlapping or floating into mid-air.
 */
export function MotionDockItem({
  mouseAxis,
  baseSize,
  maxScale,
  edge,
  vertical = false,
  variant = "square",
  iconRatio = 0.56,
  radius = 150,
  running = false,
  tip,
  ariaLabel,
  bouncing = false,
  appIcon = false,
  noDrag = false,
  className = "",
  style,
  children,
  onClick,
  onContextMenu,
  onPointerEnter,
  onPointerLeave,
}: MotionDockItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const restPillWidthRef = useRef<number>(baseSize);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const resolvedEdge: DockEdge = edge ?? (vertical ? "left" : "bottom");
  const isVertical = resolvedEdge === "left" || resolvedEdge === "right";

  const magnificationOn = maxScale > 1.01;
  const clampedScale = magnificationOn ? Math.min(2.05, Math.max(1.15, maxScale)) : 1;
  const peakSize = Math.round(baseSize * clampedScale);
  const baseInner = Math.round(baseSize * iconRatio);
  const peakInner = Math.round(peakSize * iconRatio);
  const pillPeakScale = magnificationOn ? 1 + (clampedScale - 1) * 0.34 : 1;

  const distance = useTransform(mouseAxis, (val) => {
    if (!Number.isFinite(val)) return Number.POSITIVE_INFINITY;
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return Number.POSITIVE_INFINITY;
    return isVertical
      ? val - bounds.y - bounds.height / 2
      : val - bounds.x - bounds.width / 2;
  });

  const widthSync = useTransform(distance, (d) => {
    const w = waveAt(d, radius);
    if (variant === "pill") {
      const rw = Math.max(baseSize, restPillWidthRef.current);
      return rw + rw * (pillPeakScale - 1) * w;
    }
    return baseSize + (peakSize - baseSize) * w;
  });

  const heightSync = useTransform(distance, (d) => {
    const w = waveAt(d, radius);
    const targetPeak = variant === "pill" ? Math.round(baseSize * pillPeakScale) : peakSize;
    return baseSize + (targetPeak - baseSize) * w;
  });

  const innerSizeSync = useTransform(distance, (d) => {
    return baseInner + (peakInner - baseInner) * waveAt(d, radius);
  });

  const pillContentScaleSync = useTransform(distance, (d) => {
    return 1 + (pillPeakScale - 1) * waveAt(d, radius);
  });

  const width = useSpring(widthSync, MAC_DOCK_SPRING);
  const height = useSpring(heightSync, MAC_DOCK_SPRING);
  const innerSize = useSpring(innerSizeSync, MAC_DOCK_SPRING);
  const pillContentScale = useSpring(pillContentScaleSync, MAC_DOCK_SPRING);

  useLayoutEffect(() => {
    if (variant !== "pill") return;
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      if (w > 0) {
        restPillWidthRef.current = Math.max(baseSize, w);
        if (!Number.isFinite(mouseAxis.get())) {
          width.set(restPillWidthRef.current);
        }
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [variant, baseSize, mouseAxis, width]);

  useEffect(() => {
    if (!Number.isFinite(mouseAxis.get())) {
      width.set(variant === "pill" ? Math.max(baseSize, restPillWidthRef.current) : baseSize);
      height.set(baseSize);
      innerSize.set(baseInner);
      pillContentScale.set(1);
    }
  }, [baseSize, baseInner, variant, mouseAxis, width, height, innerSize, pillContentScale]);

  const tipConfig = TOOLTIP_MOTION[resolvedEdge];

  return (
    <motion.button
      ref={ref}
      type="button"
      data-icon
      data-app-icon={appIcon ? "" : undefined}
      data-no-drag={noDrag ? "" : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerEnter={(event) => {
        setHovered(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setHovered(false);
        setPressed(false);
        onPointerLeave?.(event);
      }}
      className={`${className} active:brightness-90`}
      style={{
        ...style,
        width,
        height,
      }}
    >
      <AnimatePresence>
        {hovered && tip && (
          <motion.span
            initial={tipConfig.initial}
            animate={tipConfig.animate}
            exit={tipConfig.exit}
            transition={MAC_TOOLTIP_SPRING}
            className={`pointer-events-none absolute z-40 max-w-[180px] truncate whitespace-nowrap rounded-md border border-white/15 bg-[#0f141ef2] px-2 py-0.5 text-[11px] font-medium leading-tight text-slate-50 shadow-[0_4px_14px_rgba(0,0,0,0.4)] ${tipConfig.posClass}`}
          >
            {tip}
          </motion.span>
        )}
      </AnimatePresence>

      {variant === "square" ? (
        <motion.span
          style={{ width: innerSize, height: innerSize }}
          animate={
            bouncing
              ? {
                  y: [0, -14, 0, -6, 0],
                  scale: [1, 1.07, 0.96, 1.02, 1],
                  transition: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
                }
              : {
                  scale: pressed ? 0.9 : 1,
                  y: 0,
                  transition: { duration: 0.08 },
                }
          }
          className="pointer-events-none flex items-center justify-center"
        >
          {children}
        </motion.span>
      ) : (
        <motion.span
          ref={contentRef}
          style={{ scale: pillContentScale }}
          className="pointer-events-none inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-2.5"
        >
          <span
            className={`inline-flex items-center gap-1.5 transition-transform duration-75 ${
              pressed ? "scale-95" : ""
            }`}
          >
            {children}
          </span>
        </motion.span>
      )}

      {running && (
        <span
          aria-hidden
          className={`pointer-events-none absolute rounded-full ${RUNNING_DOT_CLASS[resolvedEdge]}`}
          style={{
            background: "var(--glacier-aurora-line)",
            boxShadow: "0 0 8px rgba(56, 189, 248, 0.65)",
          }}
        />
      )}
    </motion.button>
  );
}
