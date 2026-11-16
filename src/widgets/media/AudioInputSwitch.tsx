import { Unavailable, WidgetFrame } from "../kit";

export default function AudioInputSwitch() {

  return (
    <WidgetFrame title="Audio input">
      <Unavailable
        what="Device switching"
        requires="Changing the default endpoint needs the undocumented IPolicyConfig COM interface, which is deliberately not used."
      />
    </WidgetFrame>
  );
}
