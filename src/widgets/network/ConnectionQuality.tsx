import { PingPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function ConnectionQuality() {

  return (
    <WidgetFrame title="Quality">
      <PingPanel id="connection-quality" quality />
    </WidgetFrame>
  );
}
