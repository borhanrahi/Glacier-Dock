import { Field, WidgetFrame } from "../kit";
import { useNow, useWidgetStorage } from "../../sdk/hooks";

export default function WorldClock() {

  const [zones, setZones] = useWidgetStorage<string[]>("world-clock", "zones", [
    "UTC",
    "America/New_York",
    "Asia/Tokyo",
  ]);
  const [draft, setDraft] = useWidgetStorage<string>("world-clock", "draft", "");
  const now = useNow(1000);

  const add = () => {
    const zone = draft.trim();
    if (!zone) return;
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: zone });
    } catch {
      return;
    }
    setZones((previous) => (previous.includes(zone) ? previous : [...previous, zone]));
    setDraft("");
  };

  return (
    <WidgetFrame title="World clock" live>
      <div className="flex h-full flex-col gap-1">
        <div className="flex-1 space-y-1 overflow-y-auto">
          {zones.map((zone) => (
            <button
              key={zone}
              type="button"
              title="Remove"
              onClick={() => setZones((previous) => previous.filter((entry) => entry !== zone))}
              className="flex w-full items-baseline justify-between gap-2 rounded px-1 text-left text-[11px] hover:bg-white/10"
            >
              <span className="truncate opacity-70">{zone.split("/").pop()}</span>
              <span className="tabular-nums">
                {now.toLocaleTimeString([], { timeZone: zone, hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
          ))}
        </div>
        <Field value={draft} onChange={setDraft} placeholder="Europe/Berlin" onEnter={add} />
      </div>
    </WidgetFrame>
  );
}
