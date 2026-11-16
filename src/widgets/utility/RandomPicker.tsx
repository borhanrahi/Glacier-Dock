import { DiceTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function RandomPicker() {

  return (
    <WidgetFrame title="Pick one">
      <DiceTool id="random-picker" variant="picker" />
    </WidgetFrame>
  );
}
