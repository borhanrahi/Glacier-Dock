import { MiniButton, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function ClipboardClear() {

  const [text, setText] = useWidgetStorage<string>("clipboard-clear", "text", "");
  const [clearedAt, setClearedAt] = useWidgetStorage<string>("clipboard-clear", "clearedAt", "");
  return (
    <WidgetFrame title="Scratchpad" hint={clearedAt ? "cleared " + clearedAt : undefined}>
      <div className="flex h-full flex-col gap-1.5">
        <textarea
          value={text}
          rows={5}
          spellCheck={false}
          placeholder="Paste something sensitive…"
          onChange={(event) => setText(event.target.value)}
          className="min-h-0 flex-1 resize-none rounded-md bg-black/20 p-2 font-mono text-[10px] outline-none focus:border-[var(--glacier-accent)]"
        />
        <div className="flex gap-1">
          <MiniButton
            onClick={() => {
              setText("");
              navigator.clipboard?.writeText("").catch(() => {});
              setClearedAt(new Date().toLocaleTimeString());
            }}
          >
            Clear now
          </MiniButton>
          <MiniButton onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}>Copy</MiniButton>
        </div>
      </div>
    </WidgetFrame>
  );
}
