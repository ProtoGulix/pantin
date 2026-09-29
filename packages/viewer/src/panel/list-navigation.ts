// Keyboard behaviour of the Pantin list (listbox pattern): arrows and
// Home/End move the selection, Enter opens the selected Pantin.

export type ListCommand =
  | { type: "select"; pantinId: string }
  | { type: "open"; pantinId: string }
  | { type: "none" };

const NONE: ListCommand = { type: "none" };

function selectAt(ids: readonly string[], index: number): ListCommand {
  const pantinId = ids[index];
  return pantinId === undefined ? NONE : { type: "select", pantinId };
}

export function listCommandForKey(
  ids: readonly string[],
  selectedId: string | null,
  key: string,
): ListCommand {
  const index = selectedId === null ? -1 : ids.indexOf(selectedId);
  switch (key) {
    case "ArrowDown":
      return selectAt(ids, index < 0 ? 0 : Math.min(index + 1, ids.length - 1));
    case "ArrowUp":
      return selectAt(ids, index < 0 ? ids.length - 1 : Math.max(index - 1, 0));
    case "Home":
      return selectAt(ids, 0);
    case "End":
      return selectAt(ids, ids.length - 1);
    case "Enter":
      return selectedId !== null && index >= 0 ? { type: "open", pantinId: selectedId } : NONE;
    default:
      return NONE;
  }
}
