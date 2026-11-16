import { TotpTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function TotpCodes() {

  return (
    <WidgetFrame title="2FA">
      <TotpTool id="totp-codes" />
    </WidgetFrame>
  );
}
