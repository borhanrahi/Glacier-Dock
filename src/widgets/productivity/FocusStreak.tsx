import { MiniButton, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function FocusStreak() {

  const [days, setDays] = useWidgetStorage<string[]>("focus-streak", "days", []);
  const today = new Date().toISOString().slice(0, 10);
  const marked = days.includes(today);
  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    if (days.includes(date.toISOString().slice(0, 10))) streak += 1;
    else break;
  }
  return (
    <WidgetFrame title="Focus streak">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-3xl font-semibold tabular-nums">{streak}</span>
        <span className="text-[10px] uppercase tracking-widest opacity-50">days</span>
        <MiniButton
          active={marked}
          onClick={() =>
            setDays((previous) => (previous.includes(today) ? previous.filter((entry) => entry !== today) : [...previous, today]))
          }
        >
          {marked ? "Marked today" : "Mark today"}
        </MiniButton>
      </div>
    </WidgetFrame>
  );
}
