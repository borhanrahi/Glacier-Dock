import { PublicIpPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function PublicIp() {

  return (
    <WidgetFrame title="Public IP">
      <PublicIpPanel />
    </WidgetFrame>
  );
}
