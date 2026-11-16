import { Unavailable, WidgetFrame } from "../kit";

export default function MediaControls() {

  return (
    <WidgetFrame title="Media">
      <Unavailable
        what="Transport controls"
        requires="Play/pause needs the System Media Transport Controls WinRT API, which this Tauri build does not bind yet."
      />
    </WidgetFrame>
  );
}
