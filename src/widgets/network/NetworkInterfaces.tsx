import { InterfacesPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function NetworkInterfaces() {

  return (
    <WidgetFrame title="Adapters">
      <InterfacesPanel />
    </WidgetFrame>
  );
}
