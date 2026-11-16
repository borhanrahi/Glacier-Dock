import { MiniButton, WidgetFrame, Empty } from "../kit";
import glacier from "../../sdk/bridge";

export default function FirewallSettings() {

  return (
    <WidgetFrame title="Firewall">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Empty>Windows Security owns the firewall toggles; opening it keeps the trust boundary intact.</Empty>
        <MiniButton onClick={() => glacier.system.openPath("ms-settings:windowsdefender").catch(() => {})}>
          Open Windows Security
        </MiniButton>
      </div>
    </WidgetFrame>
  );
}
