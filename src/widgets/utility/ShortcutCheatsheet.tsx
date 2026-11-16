import { Field, Row, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function ShortcutCheatsheet() {

  const [query, setQuery] = useWidgetStorage<string>("shortcut-cheatsheet", "query", "");
  const shortcuts = [
    ["Win + Space", "Switch keyboard layout"],
    ["Win + .", "Emoji picker"],
    ["Win + V", "Clipboard history"],
    ["Alt + Tab", "Switch windows"],
    ["Win + Shift + S", "Screenshot region"],
    ["Win + D", "Show desktop"],
    ["Ctrl + Shift + Esc", "Task manager"],
    ["Win + L", "Lock the PC"],
    ["Alt + Space", "Glacier Spotlight"],
  ];
  const needle = query.trim().toLowerCase();
  const results = shortcuts.filter(([keys, label]) => (keys + " " + label).toLowerCase().includes(needle));
  return (
    <WidgetFrame title="Shortcuts" hint={results.length + " of " + shortcuts.length}>
      <div className="flex h-full flex-col gap-1">
        <Field value={query} onChange={setQuery} placeholder="Search shortcuts…" />
        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {results.map(([keys, label]) => (
            <Row key={keys} label={keys} value={label} mono />
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}
