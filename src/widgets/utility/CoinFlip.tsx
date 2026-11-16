import { DiceTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function CoinFlip() {

  return (
    <WidgetFrame title="Coin">
      <DiceTool id="coin-flip" variant="coin" />
    </WidgetFrame>
  );
}
