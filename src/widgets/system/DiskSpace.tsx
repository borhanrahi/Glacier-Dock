import { Ring, Row, WidgetFrame } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function DiskSpace() {

  const frame = useTelemetry();
  const usedPercent = frame.diskTotalGb > 0 ? (1 - frame.diskFreeGb / frame.diskTotalGb) * 100 : 0;
  return (
    <WidgetFrame title="Disk C:" live>
      <div className="flex h-full items-center justify-between gap-2">
        <Ring value={usedPercent} center={frame.diskFreeGb.toFixed(0) + "G"} label="free" color="#F472B6" />
        <div className="w-24 space-y-1 text-[10px]">
          <Row label="free" value={frame.diskFreeGb.toFixed(1) + " GB"} />
          <Row label="total" value={frame.diskTotalGb.toFixed(1) + " GB"} />
        </div>
      </div>
    </WidgetFrame>
  );
}
