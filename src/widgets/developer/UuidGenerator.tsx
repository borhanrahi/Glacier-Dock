import { TextTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function UuidGenerator() {

  return (
    <WidgetFrame title="UUID">
      <TextTool id="uuid-generator" mode="uuid" />
    </WidgetFrame>
  );
}
