import type { MenuCommand } from "../menu/menu-model.ts";
import { savePantin } from "./pantin-actions.ts";
import { requestClose, requestDelete } from "./session-actions.ts";
import { frameNode, startRename } from "./tree-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// What each menu command (or its shortcut) does. "import" is not here: the
// file picker must open inside the click itself, so the menu bar handles it.

function withSelection(store: ViewerStore, action: (nodeId: string) => void): void {
  const selected = store.state.selectedNodeId;
  if (selected !== null) {
    action(selected);
  }
}

export function runMenuCommand(
  store: ViewerStore,
  command: MenuCommand,
  changeLanguage: (language: string) => void,
): void {
  switch (command) {
    case "open":
    case "close":
      requestClose(store);
      return;
    case "save":
      void savePantin(store);
      return;
    case "import":
      return;
    case "rename":
      withSelection(store, (nodeId) => startRename(store, nodeId));
      return;
    case "delete":
      withSelection(store, (nodeId) => requestDelete(store, nodeId));
      return;
    case "frameAll":
      store.ports.viewport().frameBodies(null);
      return;
    case "frameSelection":
      withSelection(store, (nodeId) => frameNode(store, nodeId));
      return;
    default:
      changeLanguage(command.slice("language:".length));
  }
}
