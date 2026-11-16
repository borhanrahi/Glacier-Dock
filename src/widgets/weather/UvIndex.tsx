import { WeatherMetricPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function UvIndex() {

  return (
    <WidgetFrame title="UV index">
      <WeatherMetricPanel id="uv-index" metric="uv" />
    </WidgetFrame>
  );
}
