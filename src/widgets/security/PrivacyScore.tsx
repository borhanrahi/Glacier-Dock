import { PrivacyScoreTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function PrivacyScore() {

  return (
    <WidgetFrame title="Privacy">
      <PrivacyScoreTool id="privacy-score" />
    </WidgetFrame>
  );
}
