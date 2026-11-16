import { PingPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function PingMonitor() {

  return (
    <WidgetFrame title="Latency">
      <PingPanel id="ping-monitor" />
    </WidgetFrame>
  );
}
