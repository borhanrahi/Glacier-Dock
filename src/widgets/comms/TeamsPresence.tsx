import { Unavailable, WidgetFrame } from "../kit";

export default function TeamsPresence() {

  return (
    <WidgetFrame title="Teams">
      <Unavailable what="Teams" requires="Teams presence requires Microsoft Graph with delegated consent, which needs an app registration." />
    </WidgetFrame>
  );
}
