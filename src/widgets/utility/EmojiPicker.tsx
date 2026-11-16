import { WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function EmojiPicker() {

  const [copied, setCopied] = useWidgetStorage<string>("emoji-picker", "copied", "");
  const emojis = ["✅", "🎯", "🚀", "🧊", "💡", "⚠️", "❤️", "🔥", "🧠", "📌", "🎉", "🌊"];
  return (
    <WidgetFrame title="Emoji" hint={copied || "click to copy"}>
      <div className="grid grid-cols-6 gap-1">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(emoji).catch(() => {});
              setCopied(emoji);
            }}
            className="grid size-7 place-items-center rounded-md text-sm hover:bg-white/15"
          >
            {emoji}
          </button>
        ))}
      </div>
    </WidgetFrame>
  );
}
