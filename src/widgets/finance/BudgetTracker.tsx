import { Field, Ring, Row, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function BudgetTracker() {

  const [spent, setSpent] = useWidgetStorage<string>("budget-tracker", "spent", "420");
  const [limit, setLimit] = useWidgetStorage<string>("budget-tracker", "limit", "1200");
  const spentValue = Number(spent) || 0;
  const limitValue = Number(limit) || 1;
  const percent = (spentValue / limitValue) * 100;
  return (
    <WidgetFrame title="Budget">
      <div className="flex h-full items-center gap-2">
        <Ring value={percent} label="used" size={80} color={percent > 100 ? "#F87171" : undefined} />
        <div className="flex-1 space-y-1">
          <Field value={spent} onChange={setSpent} placeholder="spent" />
          <Field value={limit} onChange={setLimit} placeholder="limit" />
          <Row label="left" value={(limitValue - spentValue).toFixed(2)} />
        </div>
      </div>
    </WidgetFrame>
  );
}
