import { CalculatorTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function QuickCalculator() {

  return (
    <WidgetFrame title="Calculator">
      <CalculatorTool id="quick-calculator" />
    </WidgetFrame>
  );
}
