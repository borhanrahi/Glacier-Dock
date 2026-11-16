import { DnsPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function DnsLookup() {

  return (
    <WidgetFrame title="DNS">
      <DnsPanel id="dns-lookup" />
    </WidgetFrame>
  );
}
