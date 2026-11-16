import { MiniButton, Ring, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function AiLimitsSingle() {

  const [percent, setPercent] = useWidgetStorage<number>("ai-limits-single", "percent", 40);
  const [resetsAt, setResetsAt] = useWidgetStorage<string>("ai-limits-single", "resetsAt", "in 3h");
  return (
    <WidgetFrame title="AI quota" hint={resetsAt}>
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <Ring value={percent} label="used" color={percent > 85 ? "#F87171" : undefined} />
        <div className="flex gap-1">
          <MiniButton onClick={() => setPercent((value) => Math.max(0, value - 5))}>−</MiniButton>
          <MiniButton onClick={() => setPercent((value) => Math.min(100, value + 5))}>+</MiniButton>
          <MiniButton onClick={() => setResetsAt(new Date().toLocaleTimeString())}>reset</MiniButton>
        </div>
      </div>
    </WidgetFrame>
  );
}
