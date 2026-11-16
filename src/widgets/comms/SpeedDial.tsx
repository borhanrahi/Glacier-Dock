import { LinkList, WidgetFrame } from "../kit";

export default function SpeedDial() {

  return (
    <WidgetFrame title="Speed dial">
      <LinkList
        id="speed-dial"
        storageKey="numbers"
        initial={[{ label: "Voicemail", target: "tel:+10000000000" }]}
      />
    </WidgetFrame>
  );
}
