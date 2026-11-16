import { WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function HabitTracker() {

  const [log, setLog] = useWidgetStorage<Record<string, boolean>>("habit-tracker", "log", {});
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const key = (date: Date) => date.toISOString().slice(0, 10);
  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    if (log[key(date)]) streak += 1;
    else break;
  }
  return (
    <WidgetFrame title="Habit" hint={streak + " day streak"}>
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="flex justify-between">
          {days.map((date) => (
            <button
              key={key(date)}
              type="button"
              title={key(date)}
              onClick={() => setLog((previous) => ({ ...previous, [key(date)]: !previous[key(date)] }))}
              className="grid size-7 place-items-center rounded-full text-[9px] transition-colors"
              style={{
                background: log[key(date)] ? "var(--glacier-accent)" : "rgba(255,255,255,0.08)",
                color: log[key(date)] ? "#06121c" : "inherit",
              }}
            >
              {date.toLocaleDateString(undefined, { weekday: "narrow" })}
            </button>
          ))}
        </div>
        <span className="text-center text-[10px] opacity-50">Tap a day you completed the habit.</span>
      </div>
    </WidgetFrame>
  );
}
