import { WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function MoodLog() {

  const [today, setToday] = useWidgetStorage<string>("mood-log", "today", "");
  const options = ["😞", "😐", "🙂", "😄"];
  return (
    <WidgetFrame title="Mood" hint={today ? "logged" : "today"}>
      <div className="flex h-full items-center justify-around">
        {options.map((mood) => (
          <button
            key={mood}
            type="button"
            onClick={() => setToday(mood)}
            className="grid size-9 place-items-center rounded-full text-lg transition-transform hover:scale-110"
            style={{ background: today === mood ? "rgba(255,255,255,0.18)" : "transparent" }}
          >
            {mood}
          </button>
        ))}
      </div>
    </WidgetFrame>
  );
}
