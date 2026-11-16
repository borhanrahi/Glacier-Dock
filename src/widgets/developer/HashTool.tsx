import { TextTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function HashTool() {

  return (
    <WidgetFrame title="Hash">
      <TextTool id="hash-tool" mode="hash" />
    </WidgetFrame>
  );
}
