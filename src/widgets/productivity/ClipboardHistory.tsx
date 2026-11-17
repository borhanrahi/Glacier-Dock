import { useState } from "react";
import { Clipboard, Copy, Trash2 } from "lucide-react";
import { MiniButton, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function ClipboardHistory() {
  const [items, setItems] = useWidgetStorage<string[]>("clipboard-history", "items", []);
  const [copied, setCopied] = useState<number | null>(null);

  const capture = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setItems((prev) => [text, ...prev.filter((i) => i !== text)].slice(0, 15));
    } catch {
      /* clipboard permission denied */
    }
  };

  const copyItem = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <WidgetFrame title="Clipboard" hint={`${items.length} saved`}>
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1">
          <MiniButton onClick={capture}>
            <span className="inline-flex items-center gap-1">
              <Clipboard className="size-3" /> Capture
            </span>
          </MiniButton>
          {items.length > 0 && (
            <MiniButton onClick={() => setItems([])}>
              <span className="inline-flex items-center gap-1">
                <Trash2 className="size-3" /> Clear
              </span>
            </MiniButton>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          {items.length === 0 ? (
            <p className="py-4 text-center text-[10px] opacity-50">
              Click Capture to save the current clipboard text.
            </p>
          ) : (
            items.map((text, idx) => (
              <button
                key={`${idx}-${text.slice(0, 12)}`}
                type="button"
                onClick={() => copyItem(text, idx)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1 text-left text-[10px] hover:bg-white/10"
              >
                <span className="min-w-0 flex-1 truncate">{text}</span>
                <span className="shrink-0 opacity-60">
                  {copied === idx ? "✓" : <Copy className="size-3" />}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </WidgetFrame>
  );
}
