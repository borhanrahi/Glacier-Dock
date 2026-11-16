import { TextTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function Base64Tool() {

  return (
    <WidgetFrame title="Base64">
      <TextTool id="base64-tool" mode="base64" />
    </WidgetFrame>
  );
}
