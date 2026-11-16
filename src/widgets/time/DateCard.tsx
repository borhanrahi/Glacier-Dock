import { Row, WidgetFrame, isoWeek } from "../kit";
import { useNow } from "../../sdk/hooks";

export default function DateCard() {

  const now = useNow(30_000);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / 86_400_000) + 1;
  const daysInYear = (now.getFullYear() % 4 === 0 && now.getFullYear() % 100 !== 0) || now.getFullYear() % 400 === 0 ? 366 : 365;
  return (
    <WidgetFrame title="Today">
      <div className="flex h-full flex-col justify-center gap-1">
        <span className="text-2xl font-semibold">{now.getDate()}</span>
        <span className="text-[11px] opacity-70">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", year: "numeric" })}
        </span>
        <Row label="week" value={String(isoWeek(now))} />
        <Row label="day" value={dayOfYear + " / " + daysInYear} />
      </div>
    </WidgetFrame>
  );
}
