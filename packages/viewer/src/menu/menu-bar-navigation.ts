// Keyboard behaviour of the menu bar (WAI-ARIA menubar pattern), pure:
// where focus goes and which menu is open after a key press.

export interface FocusTarget {
  menu: number;
  // null: the menu's title in the bar; otherwise an item of the open menu.
  item: number | null;
}

export type MenuBarKeyAction =
  | { type: "move"; open: number | null; focus: FocusTarget }
  | { type: "activate" };

function wrap(value: number, count: number): number {
  return (value + count) % count;
}

function horizontal(
  key: string,
  focus: FocusTarget,
  openIndex: number | null,
  menuCount: number,
): MenuBarKeyAction {
  const next = wrap(focus.menu + (key === "ArrowRight" ? 1 : -1), menuCount);
  // With a menu open, moving sideways opens the neighbour on its first item.
  return openIndex === null
    ? { type: "move", open: null, focus: { menu: next, item: null } }
    : { type: "move", open: next, focus: { menu: next, item: 0 } };
}

function vertical(
  key: string,
  focus: FocusTarget,
  openIndex: number | null,
  itemCount: number,
): MenuBarKeyAction {
  if (focus.item === null || itemCount === 0) {
    return { type: "move", open: focus.menu, focus: { menu: focus.menu, item: 0 } };
  }
  const step = key === "ArrowDown" ? 1 : -1;
  return {
    type: "move",
    open: openIndex,
    focus: { menu: focus.menu, item: wrap(focus.item + step, itemCount) },
  };
}

/** What a key does in the menu bar; null when the key is not the bar's. */
export function menuBarKeyAction(
  key: string,
  focus: FocusTarget | null,
  openIndex: number | null,
  menuCount: number,
  itemCount: number,
): MenuBarKeyAction | null {
  if (focus === null || menuCount === 0) {
    return null;
  }
  switch (key) {
    case "ArrowRight":
    case "ArrowLeft":
      return horizontal(key, focus, openIndex, menuCount);
    case "ArrowDown":
    case "ArrowUp":
      return vertical(key, focus, openIndex, itemCount);
    case "Enter":
    case " ":
      return focus.item === null
        ? { type: "move", open: focus.menu, focus: { menu: focus.menu, item: 0 } }
        : { type: "activate" };
    case "Escape":
      return { type: "move", open: null, focus: { menu: focus.menu, item: null } };
    default:
      return null;
  }
}
