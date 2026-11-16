import { Row, WidgetFrame, clock } from "../kit";
import { useNow } from "../../sdk/hooks";

export default function CaffeineCutoff() {

  const now = useNow(30_000);
  const cutoff = new Date(now);
  cutoff.setHours(14, 0, 0, 0);
  if (cutoff.getTime() <= now.getTime()) cutoff.setDate(cutoff.getDate() + 1);
  const remaining = Math.round((cutoff.getTime() - now.getTime()) / 1000);
  return (
    <WidgetFrame title="Caffeine">
      <div className="flex h-full flex-col justify-center gap-1">
        <span className="text-xl font-semibold tabular-nums">{clock(remaining)}</span>
        <Row label="cutoff" value="14:00" />
        <Row label="status" value={now.getHours() < 14 ? "safe window" : "past cutoff"} />
      </div>
    </WidgetFrame>
  );
}
