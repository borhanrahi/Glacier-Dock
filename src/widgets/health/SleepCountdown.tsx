import { MiniButton, WidgetFrame, clock } from "../kit";
import { useNow, useWidgetStorage } from "../../sdk/hooks";

export default function SleepCountdown() {

  const [hour, setHour] = useWidgetStorage<number>("sleep-countdown", "hour", 23);
  const now = useNow(30_000);
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  const remaining = Math.round((target.getTime() - now.getTime()) / 1000);
  return (
    <WidgetFrame title="Bedtime" hint={hour + ":00"}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-2xl font-semibold tabular-nums">{clock(remaining)}</span>
        <div className="flex gap-1">
          <MiniButton onClick={() => setHour((value) => Math.max(0, value - 1))}>−1h</MiniButton>
          <MiniButton onClick={() => setHour((value) => Math.min(23, value + 1))}>+1h</MiniButton>
        </div>
      </div>
    </WidgetFrame>
  );
}
