import { WeatherMetricPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function HumidityPanel() {

  return (
    <WidgetFrame title="Humidity">
      <WeatherMetricPanel id="humidity-panel" metric="humidity" />
    </WidgetFrame>
  );
}
