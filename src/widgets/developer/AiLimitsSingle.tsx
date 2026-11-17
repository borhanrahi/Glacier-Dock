import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MiniButton, Ring, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";
import type { AiProviderUsage } from "../../components/AiUsageIsland";

export default function AiLimitsSingle() {
  const [percent, setPercent] = useWidgetStorage<number>("ai-limits-single", "percent", 40);
  const [resetsAt, setResetsAt] = useWidgetStorage<string>("ai-limits-single", "resetsAt", "in 3h");
  const [providerName, setProviderName] = useState("used");
  const [live, setLive] = useState(false);

  useEffect(() => {
    invoke<AiProviderUsage[]>("ai_usage_snapshot")
      .then((list) => {
        if (!Array.isArray(list)) return;
        const active = list.find((p) => p.state === "ready" && p.windows.length > 0);
        if (active) {
          setLive(true);
          setPercent(active.windows[0].usedPercent);
          setProviderName(active.name);
          if (active.windows[0].resetsAt) {
            setResetsAt(active.windows[0].resetsAt);
          } else {
            setResetsAt(active.windows[0].label);
          }
        }
      })
      .catch(() => {});
  }, [setPercent, setResetsAt]);

  return (
    <WidgetFrame title="AI quota" live={live} hint={resetsAt}>
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <Ring
          value={percent}
          label={providerName}
          color={percent > 85 ? "#F87171" : undefined}
        />
        <div className="flex gap-1">
          <MiniButton onClick={() => setPercent((value) => Math.max(0, value - 5))}>−</MiniButton>
          <MiniButton onClick={() => setPercent((value) => Math.min(100, value + 5))}>+</MiniButton>
          <MiniButton onClick={() => setResetsAt(new Date().toLocaleTimeString())}>reset</MiniButton>
        </div>
      </div>
    </WidgetFrame>
  );
}
