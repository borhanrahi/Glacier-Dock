import { MoneyTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function SplitBill() {

  return (
    <WidgetFrame title="Split bill">
      <MoneyTool id="split-bill" variant="split" />
    </WidgetFrame>
  );
}
