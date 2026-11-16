import { MiniButton, WidgetFrame, clock } from "../kit";
import { useEffect, useState } from "react";

export default function CallTimer() {

  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return (
    <WidgetFrame title="Call timer" live={startedAt > 0}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-2xl font-semibold tabular-nums">{clock(elapsed / 1000)}</span>
        <div className="flex gap-1">
          <MiniButton active={startedAt > 0} onClick={() => setStartedAt(startedAt ? 0 : Date.now() - elapsed)}>
            {startedAt ? "Pause" : "Start"}
          </MiniButton>
          <MiniButton
            onClick={() => {
              setStartedAt(0);
              setElapsed(0);
            }}
          >
            Reset
          </MiniButton>
        </div>
      </div>
    </WidgetFrame>
  );
}
