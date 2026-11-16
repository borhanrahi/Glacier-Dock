import { MoneyTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function TipCalculator() {

  return (
    <WidgetFrame title="Tip">
      <MoneyTool id="tip-calculator" variant="tip" />
    </WidgetFrame>
  );
}
