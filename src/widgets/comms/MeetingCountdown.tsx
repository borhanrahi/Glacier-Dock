import { MeetingPanel } from "../panels";
import { WidgetFrame } from "../kit";

export default function MeetingCountdown() {

  return (
    <WidgetFrame title="Meetings">
      <MeetingPanel id="meeting-countdown" />
    </WidgetFrame>
  );
}
