import { Stat, Spark, WidgetFrame, useHistory } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function CpuMonitor() {

  const frame = useTelemetry();
  const history = useHistory(frame.cpuPercent, frame.seq);
  return (
    <WidgetFrame title="CPU" live hint={frame.cpuUserPercent.toFixed(0) + "% user"}>
      <div className="flex h-full items-center justify-between gap-2">
        <Stat label="usage" value={frame.cpuPercent.toFixed(0)} unit="%" />
        <div className="h-12 w-28">
          <Spark values={history} max={100} />
        </div>
      </div>
    </WidgetFrame>
  );
}
