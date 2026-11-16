import { PasswordTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function PasswordStrength() {

  return (
    <WidgetFrame title="Strength">
      <PasswordTool id="password-strength" variant="strength" />
    </WidgetFrame>
  );
}
