import { Counter, WidgetFrame } from "../kit";

export default function WaterIntake() {

  return (
    <WidgetFrame title="Water">
      <Counter id="water-intake" initial={0} step={1} unit="glasses" goal={8} />
    </WidgetFrame>
  );
}
