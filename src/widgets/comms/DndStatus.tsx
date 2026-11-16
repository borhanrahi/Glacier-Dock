import { Unavailable, WidgetFrame } from "../kit";

export default function DndStatus() {

  return (
    <WidgetFrame title="Do Not Disturb">
      <Unavailable what="Do Not Disturb" requires="Reading Focus Assist needs the registry provider (Notifications\Settings). Not wired in this build." />
    </WidgetFrame>
  );
}
