import { CurrencyTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function CurrencyConverter() {

  return (
    <WidgetFrame title="Currency">
      <CurrencyTool id="currency-converter" />
    </WidgetFrame>
  );
}
