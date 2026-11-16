import { Row, WidgetFrame, clock } from "../kit";
import { useNow } from "../../sdk/hooks";
import { useRef } from "react";

export default function ScreenTime() {

  const startedAt = useRef(Date.now());
  const now = useNow(1000);
  const elapsed = Math.floor((now.getTime() - startedAt.current) / 1000);
  return (
    <WidgetFrame title="Session" live>
      <div className="flex h-full flex-col justify-center gap-1">
        <span className="text-2xl font-semibold tabular-nums">{clock(elapsed)}</span>
        <Row label="started" value={new Date(startedAt.current).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
      </div>
    </WidgetFrame>
  );
}
