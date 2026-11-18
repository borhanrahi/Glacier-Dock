import {
  useCallback,
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

export interface MotionDockItemProps {
  mouseAxis: MotionValue<number>;
  baseSize: number;
  maxScale: number;
  vertical?: boolean;
  variant?: "square" | "pill";
  radius?: number;
  lift?: number;
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

/**
 * Aceternity Floating Dock + macOS spring magnification item.
 *
 * The pointer position lives in a shared MotionValue, so pointer sweeps never
 * re-render React. Every animated property is a transform (`scale`/`x`/`y`):
 * the dock's layout box stays fixed, which keeps the hover math stable.
 */
export function MotionDockItem({
  mouseAxis,
  baseSize,
  maxScale,
  vertical = false,
  variant = "square",
  radius = 155,
  lift = 7,
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
  const [hovered, setHovered] = useState(false);

  // Rest center on the mouse axis. Measured from layout offsets, which ignore
  // transforms. Reading a live getBoundingClientRect() here used to feed the
  // magnified size back into the distance calculation, making icons jitter and
  // slide over each other as the pointer moved.
  const restCenter = useRef<number | null>(null);

  const magnificationOn = maxScale > 1.01;
  const clampedScale = magnificationOn ? Math.min(1.48, Math.max(1.12, maxScale)) : 1;
  const peakScale = variant === "square" ? clampedScale : 1 + (clampedScale - 1) * 0.42;
  const peakLift = magnificationOn ? lift : 0;
  const peakPush = magnificationOn ? (clampedScale - 1) * baseSize * 0.5 : 0;

  const measureRestCenter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect();
    const x = (parentRect?.left ?? 0) + el.offsetLeft + el.offsetWidth / 2;
    const y = (parentRect?.top ?? 0) + el.offsetTop + el.offsetHeight / 2;
    restCenter.current = vertical ? y : x;
  }, [vertical]);

  useLayoutEffect(() => {
    measureRestCenter();
    const parent = ref.current?.parentElement;
    const observer = parent ? new ResizeObserver(measureRestCenter) : undefined;
    if (parent) observer?.observe(parent);
    window.addEventListener("resize", measureRestCenter);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureRestCenter);
    };
  }, [measureRestCenter, baseSize, variant]);

  const distance = useTransform(mouseAxis, (val) => {
    const center = restCenter.current;
    return Number.isFinite(val) && center !== null ? val - center : Number.POSITIVE_INFINITY;
  });

  const scaleSync = useTransform(distance, [-radius, 0, radius], [1, peakScale, 1]);
  const liftSync = useTransform(distance, [-radius, 0, radius], [0, -peakLift, 0]);
  // Neighbours glide outward instead of being reflowed via margins, so the
  // layout (and every other item's rest center) never changes during hover.
  const pushSync = useTransform(distance, (d) => {
    if (!Number.isFinite(d) || d === 0 || peakPush <= 0) return 0;
    const falloff = Math.min(Math.abs(d), radius) / (2 * radius);
    return Math.sign(d) * peakPush * Math.cos(Math.PI * falloff) ** 2;
  });

  const scale = useSpring(scaleSync, MAC_DOCK_SPRING);
  const offset = useSpring(liftSync, MAC_DOCK_SPRING);
  const push = useSpring(pushSync, MAC_DOCK_SPRING);

  const tipPositionClass = vertical
    ? "left-full top-1/2 ml-2.5 -translate-y-1/2"
    : "-top-8 left-1/2 -translate-x-1/2";

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
      onPointerEnter={(event) => {
        setHovered(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setHovered(false);
        onPointerLeave?.(event);
      }}
      className={`${className} active:brightness-90`}
      style={{
        ...style,
        width: variant === "square" ? baseSize : undefined,
        height: baseSize,
        minWidth: variant === "pill" ? baseSize : undefined,
        scale,
        transformOrigin: vertical ? "center left" : "center bottom",
        // All motion is transform-only; the dock's layout box stays put.
        x: vertical ? offset : push,
        y: vertical ? push : offset,
      }}
    >
      <AnimatePresence>
        {hovered && tip && !vertical && (
          <motion.span
            initial={{ opacity: 0, y: 7, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.94 }}
            transition={MAC_TOOLTIP_SPRING}
            className={`pointer-events-none absolute z-40 max-w-[170px] truncate whitespace-nowrap rounded-[7px] border border-white/15 bg-[#10131ae2] px-2.5 py-0.5 text-[11px] font-medium leading-tight text-slate-50 shadow-[0_6px_18px_rgba(0,0,0,0.36)] backdrop-blur-md ${tipPositionClass}`}
          >
            {tip}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.span
        className="grid size-full place-items-center will-change-transform"
        animate={
          bouncing
            ? {
                y: [0, -14, 2, -6, 0],
                scale: [1, 1.07, 0.96, 1.02, 1],
                transition: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
              }
            : undefined
        }
      >
        {children}
      </motion.span>
    </motion.button>
  );
}
