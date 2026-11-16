import { MiniButton, Ring, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function AiLimitsDual() {

  const [limits, setLimits] = useWidgetStorage<{ openai: number; anthropic: number }>(
    "ai-limits-dual",
    "limits",
    { openai: 62, anthropic: 31 },
  );
  const bump = (key: "openai" | "anthropic", delta: number) =>
    setLimits((previous) => ({
      ...previous,
      [key]: Math.max(0, Math.min(100, previous[key] + delta)),
    }));
  return (
    <WidgetFrame title="AI limits">
      <div className="flex h-full items-center justify-around gap-1">
        {(["openai", "anthropic"] as const).map((provider) => (
          <div key={provider} className="flex flex-col items-center gap-1">
            <Ring
              value={limits[provider]}
              center={limits[provider] + "%"}
              label={provider === "openai" ? "OpenAI" : "Claude"}
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
