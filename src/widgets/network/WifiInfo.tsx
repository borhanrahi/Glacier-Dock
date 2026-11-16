import { InterfacesPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function WifiInfo() {

  return (
    <WidgetFrame title="Wi-Fi">
      <InterfacesPanel wifiOnly />
    </WidgetFrame>
  );
}
