/**
 * Shared app glyph: the real shell icon floated on a frosted, hue-stable tile.
 * Used wherever an app is shown at a "small tile" size (hidden apps panel,
 * App Library) so every surface renders icons identically.
 */

import { useAppIcon } from "../sdk/hooks";
import { appHue, initials } from "../utils/apps";
import { SettingsGearIcon } from "./DockIcons";

export function AppGlyph({
  name,
  path,
  size = 44,
  className = "",
}: {
  name: string;
  path: string | null;
  size?: number;
  className?: string;
}) {
  const icon = useAppIcon(path);
  const isSettings = Boolean(path?.toLowerCase().startsWith("ms-settings:"));
  const hue = appHue(name);

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background:
          `linear-gradient(145deg, hsl(${hue} 85% 66% / 0.92) 0%, ` +
          `hsl(${(hue + 42) % 360} 78% 46% / 0.92) 100%)`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -1px 0 rgba(0,0,0,0.18), 0 6px 16px rgba(0,0,0,0.42)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
      />
      {isSettings ? (
        <SettingsGearIcon className="relative" />
      ) : icon ? (
        <img
          src={icon}
          alt=""
          draggable={false}
          className="relative select-none object-contain"
          style={{
            width: Math.round(size * 0.66),
            height: Math.round(size * 0.66),
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45))",
          }}
        />
      ) : (
        <span
          className="relative font-bold tracking-tight text-[#08111d]"
          style={{ fontSize: Math.round(size * 0.32) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
