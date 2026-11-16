import { Empty, MiniButton, Row, WidgetFrame } from "../kit";
import { useTelemetry } from "../../sdk/hooks";
import glacier from "../../sdk/bridge";

export default function TopProcess() {

  const frame = useTelemetry();
  const top = frame.topProcess;
  return (
    <WidgetFrame title="Top process" live>
      {top ? (
        <div className="flex h-full flex-col justify-between">
          <div className="space-y-1 text-[11px]">
            <div className="truncate font-medium">{top.name}</div>
            <Row label="cpu" value={top.cpuPercent.toFixed(1) + "%"} />
            <Row label="memory" value={top.ramMb.toFixed(0) + " MB"} />
          </div>
          <MiniButton onClick={() => glacier.system.taskManager().catch(() => {})}>
            Open activity monitor
          </MiniButton>
        </div>
      ) : (
        <Empty>No process sample yet.</Empty>
      )}
    </WidgetFrame>
  );
}
