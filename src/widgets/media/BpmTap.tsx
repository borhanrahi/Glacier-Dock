import { BpmTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function BpmTap() {

  return (
    <WidgetFrame title="Tap tempo">
      <BpmTool id="bpm-tap" />
    </WidgetFrame>
  );
}
