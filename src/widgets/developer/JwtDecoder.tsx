import { TextTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function JwtDecoder() {

  return (
    <WidgetFrame title="JWT">
      <TextTool id="jwt-decoder" mode="jwt" />
    </WidgetFrame>
  );
}
