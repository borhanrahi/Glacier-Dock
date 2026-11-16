import { WidgetFrame, greeting } from "../kit";
import { useNow } from "../../sdk/hooks";

export default function ClockLarge() {

  const now = useNow(1000);
  return (
    <WidgetFrame title="Clock" live>
      <div className="flex h-full flex-col items-center justify-center gap-0.5">
        <span className="text-3xl font-semibold tabular-nums">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-[10px] opacity-60">
          {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <span className="text-[9px] uppercase tracking-[0.2em] opacity-40">{greeting(now)}</span>
      </div>
    </WidgetFrame>
  );
}
