import { MetronomeTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function Metronome() {

  return (
    <WidgetFrame title="Metronome">
      <MetronomeTool id="metronome" />
    </WidgetFrame>
  );
}
