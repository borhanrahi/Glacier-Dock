import { MiniButton, WidgetFrame, clock } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";
import { useEffect, useState } from "react";

export default function CountdownTimer() {

  const [endsAt, setEndsAt] = useWidgetStorage<number>("countdown-timer", "endsAt", 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.round((endsAt - now) / 1000));
  return (
    <WidgetFrame title="Countdown" live={remaining > 0}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-2xl font-semibold tabular-nums">{clock(remaining)}</span>
        <div className="flex gap-1">
          {[5, 10, 25, 60].map((minutes) => (
            <MiniButton key={minutes} onClick={() => setEndsAt(Date.now() + minutes * 60_000)}>
              {minutes}m
            </MiniButton>
          ))}
        </div>
        <MiniButton onClick={() => setEndsAt(0)}>Reset</MiniButton>
      </div>
    </WidgetFrame>
  );
}
