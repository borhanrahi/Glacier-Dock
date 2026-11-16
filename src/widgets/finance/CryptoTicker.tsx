import { CryptoPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function CryptoTicker() {

  return (
    <WidgetFrame title="Crypto">
      <CryptoPanel id="crypto-ticker" />
    </WidgetFrame>
  );
}
