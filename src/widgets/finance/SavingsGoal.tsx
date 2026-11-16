import { Field, Ring, Row, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function SavingsGoal() {

  const [saved, setSaved] = useWidgetStorage<string>("savings-goal", "saved", "340");
  const [target, setTarget] = useWidgetStorage<string>("savings-goal", "target", "1000");
  const savedValue = Number(saved) || 0;
  const targetValue = Number(target) || 1;
  return (
    <WidgetFrame title="Savings">
      <div className="flex h-full flex-col items-center justify-center gap-1.5">
        <Ring value={(savedValue / targetValue) * 100} center={Math.round((savedValue / targetValue) * 100) + "%"} label="of goal" size={82} color="#4ADE80" />
        <div className="flex w-full gap-1">
          <Field value={saved} onChange={setSaved} placeholder="saved" />
          <Field value={target} onChange={setTarget} placeholder="target" />
        </div>
        <Row label="left" value={(targetValue - savedValue).toFixed(2)} />
      </div>
    </WidgetFrame>
  );
}
