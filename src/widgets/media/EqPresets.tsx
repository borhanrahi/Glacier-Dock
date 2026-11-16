import { MiniButton, Row, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function EqPresets() {

  const presets: Array<{ name: string; bands: string }> = [
    { name: "Flat", bands: "0, 0, 0, 0, 0" },
    { name: "Podcast", bands: "+2, +1, 0, -1, +1" },
    { name: "Bass boost", bands: "+6, +4, 0, -1, -2" },
    { name: "Late night", bands: "-2, 0, +1, +2, +2" },
  ];
  const [copied, setCopied] = useWidgetStorage<string>("eq-presets", "copied", "");
  return (
    <WidgetFrame title="EQ presets" hint={copied || undefined}>
      <div className="flex h-full flex-col justify-center gap-1">
        {presets.map((preset) => (
          <div key={preset.name} className="flex items-center justify-between gap-2">
            <Row label={preset.name} value={preset.bands} mono />
            <MiniButton
              onClick={() => {
                navigator.clipboard?.writeText(preset.bands).catch(() => {});
                setCopied(preset.name);
              }}
            >
              copy
            </MiniButton>
          </div>
        ))}
      </div>
    </WidgetFrame>
  );
}
