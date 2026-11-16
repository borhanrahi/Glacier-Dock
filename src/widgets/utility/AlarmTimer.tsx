import { Field, MiniButton, WidgetFrame, clock } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";
import { useEffect, useState } from "react";

export default function AlarmTimer() {

  const [minutes, setMinutes] = useWidgetStorage<string>("alarm-timer", "minutes", "5");
  const [endsAt, setEndsAt] = useWidgetStorage<number>("alarm-timer", "endsAt", 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.round((endsAt - now) / 1000));
  return (
    <WidgetFrame title="Alarm" live={remaining > 0}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-2xl font-semibold tabular-nums">{clock(remaining)}</span>
        <div className="flex w-full gap-1">
          <Field value={minutes} onChange={setMinutes} placeholder="minutes" />
          <MiniButton onClick={() => setEndsAt(Date.now() + (Number(minutes) || 1) * 60_000)}>Set</MiniButton>
        </div>
        <MiniButton onClick={() => setEndsAt(0)}>Cancel</MiniButton>
      </div>
    </WidgetFrame>
  );
}
