import { InterfacesPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function LocalIp() {

  return (
    <WidgetFrame title="Local address">
      <InterfacesPanel />
    </WidgetFrame>
  );
}
