import { Row, Spark, WidgetFrame, bps, useHistory } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function BandwidthHistory() {

  const frame = useTelemetry();
  const down = useHistory(frame.netDownBps, frame.seq);
  const up = useHistory(frame.netUpBps, frame.seq);
  return (
    <WidgetFrame title="Bandwidth" live hint={bps(frame.netDownBps)}>
      <div className="flex h-full flex-col gap-1">
        <div className="flex-1">
          <Spark values={down} color="#2DD4BF" />
        </div>
        <div className="h-6 opacity-70">
          <Spark values={up} color="#A78BFA" />
        </div>
        <Row label="down / up" value={bps(frame.netDownBps) + " · " + bps(frame.netUpBps)} />
      </div>
    </WidgetFrame>
  );
}
