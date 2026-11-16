import { MoneyTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function HourlyEarnings() {

  return (
    <WidgetFrame title="Hourly">
      <MoneyTool id="hourly-earnings" variant="hourly" />
    </WidgetFrame>
  );
}
