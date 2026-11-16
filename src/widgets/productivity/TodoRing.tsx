import { Ring, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function TodoRing() {

  const [items] = useWidgetStorage<string[]>("todo-ring", "items", [
    "Review pull requests",
    "Ship milestone 4",
    "Plan tomorrow",
  ]);
  const [done, setDone] = useWidgetStorage<string[]>("todo-ring", "done", []);
  const completed = items.filter((item) => done.includes(item)).length;
  const percent = items.length ? (completed / items.length) * 100 : 0;
  return (
    <WidgetFrame title="Todos">
      <div className="flex h-full items-center gap-2">
        <Ring value={percent} label="done" size={78} />
        <div className="flex-1 space-y-0.5 overflow-y-auto text-[10px]">
          {items.map((item) => (
            <label key={item} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={done.includes(item)}
                onChange={() =>
                  setDone((previous) =>
                    previous.includes(item) ? previous.filter((entry) => entry !== item) : [...previous, item],
                  )
                }
                className="size-3 accent-[var(--glacier-accent)]"
              />
              <span className={done.includes(item) ? "line-through opacity-40" : ""}>{item}</span>
            </label>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
