import { LinkList, WidgetFrame } from "../kit";

export default function QuickEmail() {

  return (
    <WidgetFrame title="Quick email">
      <LinkList
        id="quick-email"
        storageKey="contacts"
        initial={[{ label: "Support", target: "mailto:support@example.com" }]}
      />
    </WidgetFrame>
  );
}
