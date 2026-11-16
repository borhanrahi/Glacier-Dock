import { Bars, Row, WidgetFrame } from "../kit";
import { useTelemetry } from "../../sdk/hooks";

export default function SystemSummary() {

  const frame = useTelemetry();
  const diskUsed = frame.diskTotalGb > 0 ? (1 - frame.diskFreeGb / frame.diskTotalGb) * 100 : 0;
  return (
    <WidgetFrame title="System" live>
      <div className="flex h-full flex-col justify-center gap-2">
        <Bars
          items={[
            { label: "CPU", value: frame.cpuPercent, unit: "%" },
            { label: "RAM", value: frame.ramPercent, unit: "%", color: "#A78BFA" },
            { label: "Disk", value: diskUsed, unit: "%", color: "#F472B6" },
          ]}
          max={100}
        />
        <Row label="uptime" value={frame.uptimeSecs ? Math.round(frame.uptimeSecs / 3600) + " h" : "—"} />
      </div>
    </WidgetFrame>
  );
}
