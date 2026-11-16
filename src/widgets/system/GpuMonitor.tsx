import { Unavailable, WidgetFrame } from "../kit";

export default function GpuMonitor() {

  return (
    <WidgetFrame title="GPU">
      <Unavailable
        what="GPU telemetry"
        requires="Per-GPU utilisation needs D3DKMT or ETW device counters. This build ships no such provider, so no number is shown."
      />
    </WidgetFrame>
  );
}
