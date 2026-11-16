import { Checklist, WidgetFrame } from "../kit";

export default function StandupChecklist() {

  return (
    <WidgetFrame title="Standup">
      <Checklist
        id="standup-checklist"
        storageKey="standup"
        initial={["Note yesterday's progress", "Set today's focus", "Flag blockers"]}
        placeholder="Add an item…"
      />
    </WidgetFrame>
  );
}
