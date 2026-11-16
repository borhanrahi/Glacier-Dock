import { Unavailable, WidgetFrame } from "../kit";

export default function VolumeMixer() {

  return (
    <WidgetFrame title="Volume">
      <Unavailable
        what="Per-app volume"
        requires="Needs IAudioSessionManager2 session enumeration. Not included, so no sliders are shown."
      />
    </WidgetFrame>
  );
}
