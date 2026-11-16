import { Empty, Row, WidgetFrame, clock, solarTimes } from "../kit";
import { useNow, useAsync } from "../../sdk/hooks";
import glacier from "../../sdk/bridge";

export default function DaylightLeft() {

  const now = useNow(30_000);
  const { data } = useAsync(() => glacier.config.get(), []);
  const latitude = data?.latitude ?? 0;
  const longitude = data?.longitude ?? 0;
  const solar = solarTimes(now, latitude, longitude);
  const remaining = solar.sunset ? Math.max(0, Math.round((solar.sunset.getTime() - now.getTime()) / 1000)) : 0;
  return (
    <WidgetFrame title="Daylight">
      {!latitude && !longitude ? (
        <Empty>Set your coordinates in Settings → Appearance.</Empty>
      ) : (
        <div className="flex h-full flex-col justify-center gap-1">
          <span className="text-2xl font-semibold tabular-nums">{solar.sunset ? clock(remaining) : "—"}</span>
          <Row label="sunset" value={solar.sunset ? solar.sunset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "polar day/night"} />
        </div>
      )}
    </WidgetFrame>
  );
}
