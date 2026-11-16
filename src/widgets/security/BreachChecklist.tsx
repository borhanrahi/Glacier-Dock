import { Checklist, WidgetFrame } from "../kit";

export default function BreachChecklist() {

  return (
    <WidgetFrame title="After a breach">
      <Checklist
        id="breach-checklist"
        storageKey="steps"
        initial={["Rotate the leaked password", "Enable 2FA", "Revoke active sessions", "Check recovery email"]}
        placeholder="Add a step…"
      />
    </WidgetFrame>
  );
}
