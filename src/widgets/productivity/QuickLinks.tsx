import { LinkList, WidgetFrame } from "../kit";

export default function QuickLinks() {

  return (
    <WidgetFrame title="Quick links">
      <LinkList
        id="quick-links"
        storageKey="links"
        initial={[
          { label: "Projects", target: "C:\\Users" },
          { label: "Downloads", target: "C:\\Users" },
        ]}
      />
    </WidgetFrame>
  );
}
