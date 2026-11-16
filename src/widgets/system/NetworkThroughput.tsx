import { Spark, Stat, WidgetFrame, bps, useHistory } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function NetworkThroughput() {

  const frame = useTelemetry();
  const history = useHistory(frame.netDownBps, frame.seq);
  return (
    <WidgetFrame title="Network" live>
      <div className="flex h-full flex-col gap-1">
        <div className="flex justify-between">
          <Stat label="down" value={bps(frame.netDownBps)} />
          <Stat label="up" value={bps(frame.netUpBps)} />
        </div>
        <div className="h-10 flex-1">
          <Spark values={history} color="#2DD4BF" />
        </div>
      </div>
    </WidgetFrame>
  );
}
