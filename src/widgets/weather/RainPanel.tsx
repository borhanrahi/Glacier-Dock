import { WeatherMetricPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function RainPanel() {

  return (
    <WidgetFrame title="Precipitation">
      <WeatherMetricPanel id="rain-panel" metric="rain" />
    </WidgetFrame>
  );
}
