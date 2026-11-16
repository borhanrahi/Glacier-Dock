import { NotePad, WidgetFrame } from "../kit";

export default function NotesInbox() {

  return (
    <WidgetFrame title="Notes inbox">
      <NotePad id="notes-inbox" storageKey="note" placeholder="Capture, sort later…" />
    </WidgetFrame>
  );
}
