import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MiniButton, Ring, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";
import type { AiProviderUsage } from "../../components/AiUsageIsland";

export default function AiLimitsDual() {
  const [limits, setLimits] = useWidgetStorage<{ openai: number; anthropic: number }>(
    "ai-limits-dual",
    "limits",
    { openai: 62, anthropic: 31 },
  );
  const [live, setLive] = useState(false);

  useEffect(() => {
    invoke<AiProviderUsage[]>("ai_usage_snapshot")
      .then((list) => {
        if (!Array.isArray(list)) return;
        const codex = list.find((p) => p.id === "codex" && p.state === "ready")?.windows[0];
        const claude = list.find((p) => p.id === "claude" && p.state === "ready")?.windows[0];
        if (codex || claude) {
          setLive(true);
          setLimits((prev) => ({
            openai: codex ? codex.usedPercent : prev.openai,
            anthropic: claude ? claude.usedPercent : prev.anthropic,
          }));
        }
      })
      .catch(() => {});
  }, [setLimits]);

  const bump = (key: "openai" | "anthropic", delta: number) =>
    setLimits((previous) => ({
      ...previous,
      [key]: Math.max(0, Math.min(100, previous[key] + delta)),
    }));

  return (
    <WidgetFrame title="AI limits" live={live} hint={live ? "live" : "manual"}>
      <div className="flex h-full items-center justify-around gap-1">
        {(["openai", "anthropic"] as const).map((provider) => (
          <div key={provider} className="flex flex-col items-center gap-1">
            <Ring
              value={limits[provider]}
              center={limits[provider] + "%"}
              label={provider === "openai" ? "Codex" : "Claude"}
              size={76}
              color={limits[provider] > 85 ? "#F87171" : undefined}
            />
            <div className="flex gap-1">
              <MiniButton onClick={() => bump(provider, -5)}>−</MiniButton>
              <MiniButton onClick={() => bump(provider, 5)}>+</MiniButton>
            </div>
          </div>
        ))}
      </div>
    </WidgetFrame>
  );
}
