import { Bars, WidgetFrame, isoWeek } from "../kit";
import { useNow } from "../../sdk/hooks";

export default function WeekNumber() {

  const now = useNow(30_000);
  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  const progress = ((weekday - 1) * 24 + now.getHours()) / 168 * 100;
  return (
    <WidgetFrame title="Week">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-3xl font-semibold tabular-nums">W{isoWeek(now)}</span>
        <div className="w-full">
          <Bars items={[{ label: now.toLocaleDateString(undefined, { weekday: "long" }), value: progress, unit: "%" }]} max={100} />
        </div>
      </div>
    </WidgetFrame>
  );
}
