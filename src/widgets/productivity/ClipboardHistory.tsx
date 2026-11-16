import { Unavailable, WidgetFrame } from "../kit";

export default function ClipboardHistory() {

  return (
    <WidgetFrame title="Clipboard">
      <Unavailable
        what="Clipboard history"
        requires="A clipboard listener (AddClipboardFormatListener) with a bounded in-memory ring is not wired up in this build, so nothing is recorded."
      />
    </WidgetFrame>
  );
}
