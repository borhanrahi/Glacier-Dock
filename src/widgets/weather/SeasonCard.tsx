import { Row, WidgetFrame, season } from "../kit";
import { useNow } from "../../sdk/hooks";

export default function SeasonCard() {

  const now = useNow(3_600_000);
  return (
    <WidgetFrame title="Season">
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <span className="text-2xl font-semibold">{season(now)}</span>
        <Row label="date" value={now.toLocaleDateString(undefined, { month: "long", day: "numeric" })} />
      </div>
    </WidgetFrame>
  );
}
