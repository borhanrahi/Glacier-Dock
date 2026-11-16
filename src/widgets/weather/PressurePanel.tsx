import { WeatherMetricPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function PressurePanel() {

  return (
    <WidgetFrame title="Pressure">
      <WeatherMetricPanel id="pressure-panel" metric="pressure" />
    </WidgetFrame>
  );
}
