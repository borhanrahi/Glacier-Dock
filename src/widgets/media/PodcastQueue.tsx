import { Checklist, WidgetFrame } from "../kit";

export default function PodcastQueue() {

  return (
    <WidgetFrame title="Podcast queue">
      <Checklist
        id="podcast-queue"
        storageKey="episodes"
        initial={["Ship It — observability", "Darknet Diaries — ATM"]}
        placeholder="Add an episode…"
      />
    </WidgetFrame>
  );
}
