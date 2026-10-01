import { parseStoredLayout } from "../central-layout.ts";
import type { MenuCommand } from "../menu/menu-model.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { withWelcomeShown } from "../session-state.ts";
import { deleteActuator } from "./actuator-actions.ts";
import { cycleCentralLayout, setCentralLayout } from "./diagram-actions.ts";
import { deleteDrive, toggleInspector } from "./drive-actions.ts";
import { openJointForm } from "./joint-actions.ts";
import { savePantin } from "./pantin-actions.ts";
import { deleteSensor } from "./sensor-actions.ts";
import { requestClose, requestDelete } from "./session-actions.ts";
import { frameNode, renameSelection } from "./tree-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// What each menu command (or its shortcut) does. "import" is not here: the
// file picker must open inside the click itself, so the menu bar handles it.

function withSelection(store: ViewerStore, action: (nodeId: string) => void): void {
  const selected = selectedNodeIdOf(store.state.selection);
  if (selected !== null) {
    action(selected);
  }
}

// The same calls as the inspector's Delete button (the drive, actuator and
// sensor intents); a drive still feeding an actuator is refused by the core.
function deleteSelection(store: ViewerStore): void {
  const device = selectedDeviceOf(store.state.selection);
  if (device === null) {
    withSelection(store, (nodeId) => requestDelete(store, nodeId));
  } else if (device.kind === "drive") {
    void deleteDrive(store, device.id);
  } else if (device.kind === "actuator") {
    void deleteActuator(store, device.id);
  } else {
    void deleteSensor(store, device.id);
  }
}

// "language:fr" and "layout:3d": the part after the colon is the argument.
// A layout is parsed, not cast: the command is a plain string by now.
function runParameterisedCommand(
  store: ViewerStore,
  command: string,
  changeLanguage: (language: string) => void,
): void {
  if (command.startsWith("layout:")) {
    setCentralLayout(store, parseStoredLayout(command.slice("layout:".length)));
  } else {
    changeLanguage(command.slice("language:".length));
  }
}

export function runMenuCommand(
  store: ViewerStore,
  command: MenuCommand,
  changeLanguage: (language: string) => void,
): void {
  switch (command) {
    case "welcome":
      store.update(withWelcomeShown(store.state));
      return;
    case "open":
      // With nothing open, "Ouvrir…" is the list of the welcome dialog.
      if (store.state.openPantin === null) {
        store.update(withWelcomeShown(store.state, "all"));
      } else {
        requestClose(store);
      }
      return;
    case "close":
      requestClose(store);
      return;
    case "save":
      void savePantin(store);
      return;
    case "import":
      return;
    case "newJoint":
      openJointForm(store);
      return;
    case "rename":
      renameSelection(store);
      return;
    case "delete":
      deleteSelection(store);
      return;
    case "cycleLayout":
      cycleCentralLayout(store);
      return;
    case "toggleInspector":
      toggleInspector(store);
      return;
    case "frameAll":
      store.ports.viewport().frameBodies(null);
      return;
    case "frameSelection":
      withSelection(store, (nodeId) => frameNode(store, nodeId));
      return;
    default:
      runParameterisedCommand(store, command, changeLanguage);
  }
}
