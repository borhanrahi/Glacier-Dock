import { Bell, BellOff } from "lucide-react";
import { MiniButton, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function DndStatus() {
  const [active, setActive] = useWidgetStorage<boolean>("dnd-status", "active", false);
  const [label, setLabel] = useWidgetStorage<string>("dnd-status", "label", "Focus mode");

  return (
    <WidgetFrame title="Do Not Disturb" live={active} hint={active ? "Muted" : "Allowing alerts"}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-semibold transition-all active:scale-95 ${
            active
              ? "bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/50"
              : "bg-white/10 hover:bg-white/15"
          }`}
        >
          {active ? <BellOff className="size-4" /> : <Bell className="size-4" />}
          <span>{active ? "DND On" : "DND Off"}</span>
        </button>
        <div className="flex gap-1">
          {["Focus mode", "In a meeting", "Deep work"].map((preset) => (
            <MiniButton key={preset} onClick={() => setLabel(preset)}>
              <span className={label === preset ? "text-[var(--glacier-accent)]" : ""}>
                {preset}
              </span>
            </MiniButton>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
