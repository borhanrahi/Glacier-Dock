import { Checklist, WidgetFrame } from "../kit";

export default function InboxZero() {

  return (
    <WidgetFrame title="Inbox zero">
      <Checklist
        id="inbox-zero"
        storageKey="triage"
        initial={["Delete the obvious noise", "Reply in two sentences", "Delegate what is not yours", "Archive the rest"]}
        placeholder="Add a step…"
      />
    </WidgetFrame>
  );
}
