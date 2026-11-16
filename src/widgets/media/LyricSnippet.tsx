import { NotePad, WidgetFrame } from "../kit";

export default function LyricSnippet() {

  return (
    <WidgetFrame title="Lyrics">
      <NotePad id="lyric-snippet" storageKey="lyrics" placeholder="Lines you are learning…" />
    </WidgetFrame>
  );
}
