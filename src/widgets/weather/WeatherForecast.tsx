import { WeatherForecastPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function WeatherForecast() {

  return (
    <WidgetFrame title="Forecast">
      <WeatherForecastPanel id="weather-forecast" />
    </WidgetFrame>
  );
}
