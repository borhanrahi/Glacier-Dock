import { PortsPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function ListeningPorts() {

  return (
    <WidgetFrame title="Dev ports">
      <PortsPanel limit={6} />
    </WidgetFrame>
  );
}
