import { NotePad, WidgetFrame } from "../kit";

export default function EncryptionNote() {

  return (
    <WidgetFrame title="Recovery note">
      <NotePad id="encryption-note" storageKey="note" placeholder="Where the recovery keys live (never the keys themselves)…" />
    </WidgetFrame>
  );
}
