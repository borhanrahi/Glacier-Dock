import { DiceTool } from "../tools";
import { WidgetFrame } from "../kit";

export default function DiceRoller() {

  return (
    <WidgetFrame title="Dice">
      <DiceTool id="dice-roller" variant="dice" />
    </WidgetFrame>
  );
}
