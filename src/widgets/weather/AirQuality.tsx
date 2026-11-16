import { AirQualityPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function AirQuality() {

  return (
    <WidgetFrame title="Air">
      <AirQualityPanel id="air-quality" />
    </WidgetFrame>
  );
}
