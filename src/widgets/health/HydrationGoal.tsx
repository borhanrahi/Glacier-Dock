import { Counter, WidgetFrame } from "../kit";

export default function HydrationGoal() {

  return (
    <WidgetFrame title="Hydration">
      <Counter id="hydration-goal" initial={0} step={1} unit="glasses" goal={8} />
    </WidgetFrame>
  );
}
