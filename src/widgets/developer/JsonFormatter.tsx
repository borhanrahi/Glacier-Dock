import { TextTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function JsonFormatter() {

  return (
    <WidgetFrame title="JSON">
      <TextTool id="json-formatter" mode="json" />
    </WidgetFrame>
  );
}
