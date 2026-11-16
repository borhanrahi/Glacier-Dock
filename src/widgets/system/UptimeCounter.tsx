import { WidgetFrame, uptime } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function UptimeCounter() {

  const frame = useTelemetry();
  return (
    <WidgetFrame title="Uptime" live>
      <div className="grid h-full place-items-center">
        <span className="text-2xl font-semibold tabular-nums">{uptime(frame.uptimeSecs)}</span>
      </div>
    </WidgetFrame>
  );
}
