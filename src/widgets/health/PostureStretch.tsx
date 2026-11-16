import { MiniButton, WidgetFrame, clock } from "../kit";
import { useNow, useWidgetStorage } from "../../sdk/hooks";

export default function PostureStretch() {

  const [duration] = useWidgetStorage<number>("posture-stretch", "minutes", 30);
  const [endsAt, setEndsAt] = useWidgetStorage<number>("posture-stretch", "endsAt", 0);
  const now = useNow(1000);
  const remaining = Math.max(0, Math.round((endsAt - now.getTime()) / 1000));
  return (
    <WidgetFrame title="Stretch" live={remaining > 0}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {remaining ? clock(remaining) : duration + " min"}
        </span>
        <div className="flex gap-1">
          <MiniButton onClick={() => setEndsAt(Date.now() + duration * 60_000)}>Start</MiniButton>
          <MiniButton onClick={() => setEndsAt(0)}>Stop</MiniButton>
        </div>
      </div>
    </WidgetFrame>
  );
}
