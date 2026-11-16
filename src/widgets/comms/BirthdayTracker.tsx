import { Field, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function BirthdayTracker() {

  const [list, setList] = useWidgetStorage<string[]>("birthday-tracker", "list", ["Alex 04-12", "Sam 09-03"]);
  const [draft, setDraft] = useWidgetStorage<string>("birthday-tracker", "draft", "");
  const now = new Date();
  const upcoming = list
    .map((entry) => {
      const [name, date = "01-01"] = entry.split(" ");
      const [month, day] = date.split("-").map(Number);
      const next = new Date(now.getFullYear(), (month || 1) - 1, day || 1);
      if (next.getTime() < now.getTime()) next.setFullYear(now.getFullYear() + 1);
      return { name, days: Math.ceil((next.getTime() - now.getTime()) / 86_400_000) };
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  const add = () => {
    if (!draft.trim()) return;
    setList((previous) => [...previous, draft.trim()]);
    setDraft("");
  };
  return (
    <WidgetFrame title="Birthdays">
      <div className="flex h-full flex-col gap-1 text-[11px]">
        <div className="flex-1 space-y-0.5">
          {upcoming.map((entry) => (
            <div key={entry.name} className="flex justify-between">
              <span className="truncate">{entry.name}</span>
              <span className="tabular-nums opacity-60">{entry.days === 0 ? "today!" : entry.days + "d"}</span>
            </div>
          ))}
        </div>
        <Field value={draft} onChange={setDraft} placeholder="Name MM-DD" onEnter={add} />
      </div>
    </WidgetFrame>
  );
}
