import { Checklist, WidgetFrame } from "../kit";

export default function SubscriptionTracker() {

  return (
    <WidgetFrame title="Subscriptions">
      <Checklist
        id="subscription-tracker"
        storageKey="subs"
        initial={["Music — renews on the 4th", "Cloud storage — 12th", "Domain — 21st"]}
        placeholder="Add a renewal…"
      />
    </WidgetFrame>
  );
}
