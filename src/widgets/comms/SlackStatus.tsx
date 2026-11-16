import { Unavailable, WidgetFrame } from "../kit";

export default function SlackStatus() {

  return (
    <WidgetFrame title="Slack">
      <Unavailable what="Slack" requires="Syncing Slack status needs an OAuth app and token exchange; the store cannot ship a client secret." />
    </WidgetFrame>
  );
}
