import { NotePad, WidgetFrame } from "../kit";

export default function ExpenseLog() {

  return (
    <WidgetFrame title="Expenses">
      <NotePad id="expense-log" storageKey="log" placeholder="date · amount · what" />
    </WidgetFrame>
  );
}
