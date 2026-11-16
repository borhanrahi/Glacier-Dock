import { Checklist, WidgetFrame } from "../kit";

export default function DailyGoals() {

  return (
    <WidgetFrame title="Daily goals">
      <Checklist
        id="daily-goals"
        storageKey="goals"
        initial={["Deep work 2h", "Move 30 min", "Read 20 pages"]}
        placeholder="Add a goal…"
      />
    </WidgetFrame>
  );
}
