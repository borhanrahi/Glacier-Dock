import { ProxyStatusPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function ProxyStatus() {

  return (
    <WidgetFrame title="Proxy">
      <ProxyStatusPanel />
    </WidgetFrame>
  );
}
