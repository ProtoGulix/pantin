import { shortcutForKeyPress } from "../menu/menu-model.ts";
import type { ViewerState } from "../viewer-state.ts";
import type { PanelIntents } from "./panel-intents.ts";

// Window-wide keyboard shortcuts of the menu bar (Ctrl+S, F2, Suppr). The
// rules live in the menu model; this only reads the key and the focus.

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target.closest("input, textarea, select") !== null;
}

export function listenToShortcuts(state: () => ViewerState, intents: PanelIntents): void {
  const match = (event: KeyboardEvent) =>
    shortcutForKeyPress(state(), {
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      inEditableField: isEditable(event.target),
    });
  // Ctrl/Cmd shortcuts in the capture phase: text fields stop the propagation
  // of their keys, and the browser's own Ctrl+S must be blocked everywhere.
  document.addEventListener(
    "keydown",
    (event) => {
      const found = match(event);
      if (found?.primaryModifier) {
        event.preventDefault();
        if (found.run) {
          intents.runMenuCommand(found.command);
        }
      }
    },
    { capture: true },
  );
  // Plain keys (F2, Suppr) in the bubble phase: a component that handled the
  // key first (tree F2, menu arrows) has the last word.
  document.addEventListener("keydown", (event) => {
    const found = match(event);
    if (event.defaultPrevented || found === null || found.primaryModifier || !found.run) {
      return;
    }
    event.preventDefault();
    intents.runMenuCommand(found.command);
  });
}
