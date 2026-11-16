import { PasswordTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function PasswordGenerator() {

  return (
    <WidgetFrame title="Password">
      <PasswordTool id="password-generator" variant="generate" />
    </WidgetFrame>
  );
}
