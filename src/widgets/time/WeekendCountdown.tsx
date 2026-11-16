import { Row, WidgetFrame } from "../kit";
import { useNow } from "../../sdk/hooks";

export default function WeekendCountdown() {

  const now = useNow(60_000);
  const target = new Date(now);
  const day = now.getDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  target.setDate(now.getDate() + daysUntilFriday);
  target.setHours(18, 0, 0, 0);
  if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 7);
  const diff = target.getTime() - now.getTime();
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return (
    <WidgetFrame title="Weekend">
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <span className="text-2xl font-semibold tabular-nums">
          {days}d {hours}h {minutes}m
        </span>
        <Row label="until" value="Friday 18:00" />
      </div>
    </WidgetFrame>
  );
}
