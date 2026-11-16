import { WeatherNowPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function WeatherNow() {

  return (
    <WidgetFrame title="Weather">
      <WeatherNowPanel id="weather-now" />
    </WidgetFrame>
  );
}
