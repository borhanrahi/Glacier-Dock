import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

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
 * Reads `mouseAxis` via MotionValues so pointer sweeps run on Framer Motion's
 * internal frameloop without triggering React state re-renders.
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

  const magnificationOn = maxScale > 1.01;
  const clampedScale = magnificationOn ? Math.min(1.48, Math.max(1.12, maxScale)) : 1;
  const peakSquare = Math.round(baseSize * clampedScale);
  const peakPillScale = magnificationOn ? 1 + (clampedScale - 1) * 0.42 : 1;
  const peakSpread = magnificationOn ? Math.round((clampedScale - 1) * 26) : 0;
  const peakLift = magnificationOn ? lift : 0;

  const distance = useTransform(mouseAxis, (val) => {
    if (!Number.isFinite(val)) return Number.POSITIVE_INFINITY;
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return Number.POSITIVE_INFINITY;
    return vertical
      ? val - bounds.y - bounds.height / 2
      : val - bounds.x - bounds.width / 2;
  });

  const sizeSync = useTransform(
    distance,
    [-radius, 0, radius],
    [baseSize, peakSquare, baseSize],
  );
  const ySync = useTransform(
    distance,
    [-radius, 0, radius],
    [0, -peakLift, 0],
  );
  const pillScaleSync = useTransform(
    distance,
    [-radius, 0, radius],
    [1, peakPillScale, 1],
  );
  const spreadSync = useTransform(
    distance,
    [-radius, 0, radius],
    [0, peakSpread, 0],
  );

  const boxSize = useSpring(sizeSync, MAC_DOCK_SPRING);
  const yOffset = useSpring(ySync, MAC_DOCK_SPRING);
  const pillScale = useSpring(pillScaleSync, MAC_DOCK_SPRING);
  const spread = useSpring(spreadSync, MAC_DOCK_SPRING);

  useEffect(() => {
    boxSize.set(baseSize);
  }, [baseSize, boxSize]);

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
      whileTap={{ scale: 0.88 }}
      animate={
        bouncing
          ? {
              y: [0, -14, 2, -6, 0],
              scale: [1, 1.07, 0.96, 1.02, 1],
              transition: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
            }
          : undefined
      }
      className={className}
      style={{
        ...style,
        width: variant === "square" ? boxSize : undefined,
        height: variant === "square" ? boxSize : baseSize,
        minWidth: variant === "pill" ? baseSize : undefined,
        scale: variant === "pill" ? pillScale : undefined,
        marginInline: variant === "pill" && !vertical ? spread : undefined,
        marginBlock: variant === "pill" && vertical ? spread : undefined,
        y: vertical ? undefined : yOffset,
        x: vertical ? yOffset : undefined,
        transformOrigin: vertical ? "center left" : "center bottom",
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
      {children}
    </motion.button>
  );
}
