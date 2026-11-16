import { Unavailable, WidgetFrame } from "../kit";

export default function MicMuteCombo() {

  return (
    <WidgetFrame title="Microphone">
      <Unavailable
        what="Mic mute"
        requires="Muting the capture endpoint requires Core Audio (IMMDeviceEnumerator + IAudioEndpointVolume). Not implemented yet."
      />
    </WidgetFrame>
  );
}
