import { MiniButton, WidgetFrame, clock } from "../kit";
import { useNow, useWidgetStorage } from "../../sdk/hooks";

export default function PomodoroTimer() {

  const [phase, setPhase] = useWidgetStorage<"focus" | "break">("pomodoro-timer", "phase", "focus");
  const [endsAt, setEndsAt] = useWidgetStorage<number>("pomodoro-timer", "endsAt", 0);
  const now = useNow(500);
  const remaining = Math.max(0, Math.round((endsAt - now.getTime()) / 1000));
  const start = (minutes: number, next: "focus" | "break") => {
    setPhase(next);
    setEndsAt(Date.now() + minutes * 60_000);
  };
  return (
    <WidgetFrame title="Pomodoro" hint={phase} live={remaining > 0}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <span className="text-2xl font-semibold tabular-nums">{clock(remaining)}</span>
        <div className="flex gap-1">
          <MiniButton onClick={() => start(25, "focus")}>Focus 25</MiniButton>
          <MiniButton onClick={() => start(5, "break")}>Break 5</MiniButton>
        </div>
        <MiniButton onClick={() => setEndsAt(0)}>Reset</MiniButton>
      </div>
    </WidgetFrame>
  );
}
