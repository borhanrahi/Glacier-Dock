import { MiniButton, WidgetFrame } from "../kit";
import { useWidgetStorage } from "../../sdk/hooks";

export default function MessageTemplates() {

  const [copied, setCopied] = useWidgetStorage<string>("message-templates", "copied", "");
  const templates = [
    { name: "On my way", body: "On my way — should be there in 10 minutes." },
    { name: "Decline politely", body: "Thanks for the invite — I cannot make this one, but please share the notes." },
    { name: "Need detail", body: "Could you share the reproduction steps and the expected behaviour?" },
  ];
  return (
    <WidgetFrame title="Templates" hint={copied ? "copied " + copied : undefined}>
      <div className="flex h-full flex-col justify-center gap-1.5">
        {templates.map((template) => (
          <div key={template.name} className="rounded-md bg-white/5 p-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-medium">{template.name}</span>
              <MiniButton
                onClick={() => {
                  navigator.clipboard?.writeText(template.body).catch(() => {});
                  setCopied(template.name);
                }}
              >
                copy
              </MiniButton>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug opacity-60">{template.body}</p>
          </div>
        ))}
      </div>
    </WidgetFrame>
  );
}
