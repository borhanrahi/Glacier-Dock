import { Ring, Row, WidgetFrame } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function MemoryGauge() {

  const frame = useTelemetry();
  return (
    <WidgetFrame title="Memory" live>
      <div className="flex h-full items-center justify-between gap-2">
        <Ring value={frame.ramPercent} label="in use" />
        <div className="w-24 space-y-1 text-[10px]">
          <Row label="used" value={frame.ramUsedMb.toFixed(0) + " MB"} />
          <Row label="total" value={frame.ramTotalMb.toFixed(0) + " MB"} />
          <Row label="commit" value={frame.commitUsedMb.toFixed(0) + " MB"} />
        </div>
      </div>
    </WidgetFrame>
  );
}
