import { NotePad, WidgetFrame } from "../kit";

export default function ScratchNote() {

  return (
    <WidgetFrame title="Scratch note">
      <NotePad id="scratch-note" storageKey="note" placeholder="Anything on your mind…" rows={8} />
    </WidgetFrame>
  );
}
