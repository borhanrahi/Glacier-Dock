import { Counter, WidgetFrame } from "../kit";

export default function FocusSessions() {

  return (
    <WidgetFrame title="Focus" hint="sessions">
      <Counter id="focus-sessions" initial={0} step={1} unit="blocks" goal={6} />
    </WidgetFrame>
  );
}
