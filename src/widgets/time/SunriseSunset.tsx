import { Empty, Row, WidgetFrame, solarTimes } from "../kit";
import { useNow, useAsync } from "../../sdk/hooks";
import glacier from "../../sdk/bridge";

export default function SunriseSunset() {

  const now = useNow(30_000);
  const { data } = useAsync(() => glacier.config.get(), []);
  const latitude = data?.latitude ?? 0;
  const longitude = data?.longitude ?? 0;
  const solar = solarTimes(now, latitude, longitude);
  return (
    <WidgetFrame title="Sun">
      {!latitude && !longitude ? (
        <Empty>Set your latitude and longitude in Settings → Appearance.</Empty>
      ) : (
        <div className="flex h-full flex-col justify-center gap-1 text-[11px]">
          <Row label="sunrise" value={solar.sunrise ? solar.sunrise.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "polar night"} />
          <Row label="sunset" value={solar.sunset ? solar.sunset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "polar day"} />
          <Row label="daylight" value={solar.dayLength ? solar.dayLength.toFixed(1) + " h" : "—"} />
        </div>
      )}
    </WidgetFrame>
  );
}
