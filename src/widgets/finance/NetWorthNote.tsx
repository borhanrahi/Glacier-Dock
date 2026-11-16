import { NotePad, WidgetFrame } from "../kit";

export default function NetWorthNote() {

  return (
    <WidgetFrame title="Net worth">
      <NotePad id="net-worth-note" storageKey="note" placeholder="Balances you track by hand…" />
    </WidgetFrame>
  );
}
