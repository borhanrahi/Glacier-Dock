import { Empty, Ring, Row, WidgetFrame, uptime } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function BatteryStatus() {

  const frame = useTelemetry();
  const percent = frame.batteryPercent;
  return (
    <WidgetFrame title="Battery" live>
      {percent === null ? (
        <Empty>No battery detected.</Empty>
      ) : (
        <div className="flex h-full items-center justify-between gap-2">
          <Ring
            value={percent}
            label={frame.batteryCharging ? "charging" : "remaining"}
            color={percent > 30 ? "#34D399" : "#F87171"}
          />
          <div className="w-24 space-y-1 text-[10px]">
            <Row label="state" value={frame.batteryCharging ? "AC" : "battery"} />
            <Row label="left" value={frame.batterySecondsLeft ? uptime(frame.batterySecondsLeft) : "—"} />
          </div>
        </div>
      )}
    </WidgetFrame>
  );
}
