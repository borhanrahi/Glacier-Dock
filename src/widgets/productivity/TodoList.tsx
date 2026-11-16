import { Checklist, WidgetFrame } from "../kit";

export default function TodoList() {

  return (
    <WidgetFrame title="Todo list">
      <Checklist
        id="todo-list"
        storageKey="items"
        initial={["Inbox to zero", "Write release notes", "Water the plants"]}
        placeholder="Add a task…"
      />
    </WidgetFrame>
  );
}
