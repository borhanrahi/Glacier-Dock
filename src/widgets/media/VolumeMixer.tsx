import { invoke } from "@tauri-apps/api/core";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { WidgetFrame } from "../kit";

export default function VolumeMixer() {
  const send = (action: string) => invoke("media_key", { action }).catch(() => {});

  return (
    <WidgetFrame title="Volume" hint="System Audio">
      <div className="flex h-full items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => send("mute")}
          className="glacier-widget-pill flex flex-col items-center gap-1 px-3 py-2 text-[10px] hover:bg-white/15 active:scale-95"
        >
          <VolumeX className="size-4 text-rose-300" />
          <span>Mute</span>
        </button>
        <button
          type="button"
          onClick={() => send("vol_down")}
          className="glacier-widget-pill flex flex-col items-center gap-1 px-3 py-2 text-[10px] hover:bg-white/15 active:scale-95"
        >
          <Volume1 className="size-4" />
          <span>Vol −</span>
        </button>
        <button
          type="button"
          onClick={() => send("vol_up")}
          className="glacier-widget-pill flex flex-col items-center gap-1 px-3 py-2 text-[10px] hover:bg-white/15 active:scale-95"
        >
          <Volume2 className="size-4 text-sky-300" />
          <span>Vol +</span>
        </button>
      </div>
    </WidgetFrame>
  );
}
