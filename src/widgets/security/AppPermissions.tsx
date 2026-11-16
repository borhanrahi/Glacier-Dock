import { Checklist, WidgetFrame } from "../kit";

export default function AppPermissions() {

  return (
    <WidgetFrame title="Permissions">
      <Checklist
        id="app-permissions"
        storageKey="audit"
        initial={["Review camera access", "Review microphone access", "Review location access", "Review startup apps"]}
        placeholder="Add an item…"
      />
    </WidgetFrame>
  );
}
