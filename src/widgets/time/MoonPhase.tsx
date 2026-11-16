import { Row, WidgetFrame, moonPhase } from "../kit";
import { useNow } from "../../sdk/hooks";

export default function MoonPhase() {

  const now = useNow(60_000);
  const moon = moonPhase(now);
  return (
    <WidgetFrame title="Moon">
      <div className="flex h-full items-center justify-between gap-2">
        <span className="text-4xl">{moon.glyph}</span>
        <div className="space-y-1 text-right text-[10px]">
          <div className="text-[11px] font-medium">{moon.name}</div>
          <Row label="lit" value={(moon.illumination * 100).toFixed(0) + "%"} />
        </div>
      </div>
    </WidgetFrame>
  );
}
