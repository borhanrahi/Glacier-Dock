import { PortsPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function PortKiller() {

  return (
    <WidgetFrame title="Open ports">
      <PortsPanel limit={8} />
    </WidgetFrame>
  );
}
