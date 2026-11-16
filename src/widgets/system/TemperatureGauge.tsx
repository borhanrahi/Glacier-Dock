import { Unavailable, WidgetFrame } from "../kit";

export default function TemperatureGauge() {

  return (
    <WidgetFrame title="Temperature">
      <Unavailable
        what="Thermals"
        requires="Reading CPU temperature requires WMI MSAcpi_ThermalZoneTemperature or a vendor SDK; both are frequently unavailable on desktops."
      />
    </WidgetFrame>
  );
}
