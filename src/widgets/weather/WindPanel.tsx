import { WeatherMetricPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function WindPanel() {

  return (
    <WidgetFrame title="Wind">
      <WeatherMetricPanel id="wind-panel" metric="wind" />
    </WidgetFrame>
  );
}
