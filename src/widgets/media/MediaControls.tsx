import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { WidgetFrame } from "../kit";

export default function MediaControls() {
  const [playing, setPlaying] = useState(false);

  const send = (action: string) => {
    if (action === "play_pause") setPlaying((p) => !p);
    invoke("media_key", { action }).catch(() => {});
  };

  return (
    <WidgetFrame title="Media" live hint="Windows Transport">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous track"
            onClick={() => send("prev")}
            className="glacier-widget-pill grid size-9 place-items-center hover:bg-white/15 active:scale-95"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Play or pause"
            onClick={() => send("play_pause")}
            className="grid size-11 place-items-center rounded-full text-[#08111d] shadow-md transition-transform active:scale-95"
            style={{ background: "var(--glacier-aurora)" }}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
          </button>
          <button
            type="button"
            aria-label="Next track"
            onClick={() => send("next")}
            className="glacier-widget-pill grid size-9 place-items-center hover:bg-white/15 active:scale-95"
          >
            <SkipForward className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Mute"
            onClick={() => send("mute")}
            className="glacier-widget-pill flex items-center gap-1 px-2.5 py-1 text-[10px] hover:bg-white/15"
          >
            <VolumeX className="size-3.5" />
            <span>Mute</span>
          </button>
          <button
            type="button"
            aria-label="Volume up"
            onClick={() => send("vol_up")}
            className="glacier-widget-pill flex items-center gap-1 px-2.5 py-1 text-[10px] hover:bg-white/15"
          >
            <Volume2 className="size-3.5" />
            <span>Vol +</span>
          </button>
        </div>
      </div>
    </WidgetFrame>
  );
}
