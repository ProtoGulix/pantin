import { parseCentralView, type Zone } from "../central-layout.ts";
import { isConveyorKind } from "../conveyors/conveyor-kinds.ts";
import type { MenuCommand } from "../menu/menu-model.ts";
import { selectedDeviceOf, selectedNodeIdOf } from "../selection.ts";
import { withWelcomeShown } from "../session-state.ts";
import { isThemeChoice } from "../theme/theme.ts";
import { openAbout, openDocumentation } from "./about-actions.ts";
import { deleteActuator } from "./actuator-actions.ts";
import { toggleAlignment } from "./alignment-actions.ts";
import { toggleConsole } from "./console-actions.ts";
import { deleteConveyor, resetSimulation } from "./conveyor-actions.ts";
import {
  chooseZoneView,
  closeBottomZoneOf,
  cycleTopView,
  openBottomZoneOf,
} from "./diagram-actions.ts";
import { deleteDrive, toggleInspector } from "./drive-actions.ts";
import { releaseAllTags } from "./drive-commands.ts";
import { toggleGizmo, toggleGizmoSpace } from "./gizmo-actions.ts";
import { requestGroup, ungroupSelection } from "./grouping-actions.ts";
import { openJointForm } from "./joint-actions.ts";
import {
  setArrowStep,
  setNavigationPreset,
  showStandardView,
  togglePerspective,
  toggleReverseWheel,
} from "./navigation-actions.ts";
import { requestOrphanCleanup } from "./orphan-cleanup-actions.ts";
import { savePantin } from "./pantin-actions.ts";
import { requestRedundantJointsDeletion } from "./redundant-joints-actions.ts";
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
  } else if (isConveyorKind(device.kind)) {
    void deleteConveyor(store, device.kind, device.id);
  } else if (device.kind === "drive") {
    void deleteDrive(store, device.id);
  } else if (device.kind === "actuator") {
    void deleteActuator(store, device.id);
  } else {
    void deleteSensor(store, device.id);
  }
}

function chooseTheme(store: ViewerStore, choice: string): void {
  if (isThemeChoice(choice)) {
    store.ports.applyTheme(choice);
    store.update({ ...store.state, themeChoice: choice });
  }
}

function chooseParsedView(store: ViewerStore, zone: Zone, text: string): void {
  const view = parseCentralView(text);
  if (view !== null) {
    chooseZoneView(store, zone, view);
  }
}

// "language:fr", "topView:diagram", "navigation:zw3d", "arrowStep:15" and "theme:dark": the part after the colon is the argument.
// A view is parsed, not cast: the command is a plain string by now.
function runParameterisedCommand(
  store: ViewerStore,
  command: string,
  changeLanguage: (language: string) => void,
): void {
  if (command.startsWith("topView:")) {
    chooseParsedView(store, "top", command.slice("topView:".length));
  } else if (command.startsWith("bottomView:")) {
    chooseParsedView(store, "bottom", command.slice("bottomView:".length));
  } else if (command.startsWith("navigation:")) {
    setNavigationPreset(store, command.slice("navigation:".length));
  } else if (command.startsWith("view:")) {
    showStandardView(store, command.slice("view:".length));
  } else if (command.startsWith("arrowStep:")) {
    setArrowStep(store, command.slice("arrowStep:".length));
  } else if (command.startsWith("theme:")) {
    chooseTheme(store, command.slice("theme:".length));
  } else {
    changeLanguage(command.slice("language:".length));
  }
}

// The Affichage menu: panels, layout, framing, then the parameterised commands.
function runViewCommand(
  store: ViewerStore,
  command: MenuCommand,
  changeLanguage: (language: string) => void,
): void {
  switch (command) {
    case "cycleLayout":
      cycleTopView(store);
      return;
    case "openBottomZone":
      openBottomZoneOf(store);
      return;
    case "closeBottomZone":
      closeBottomZoneOf(store);
      return;
    case "toggleConsole":
      toggleConsole(store);
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
    case "perspective":
      togglePerspective(store);
      return;
    case "reverseWheel":
      toggleReverseWheel(store);
      return;
    default:
      runParameterisedCommand(store, command, changeLanguage);
  }
}

// The positioning tools (ADR 0034, 0035, 0042): the inspector's buttons and keys.
function runPositioningCommand(
  store: ViewerStore,
  command: "gizmoMove" | "gizmoRotate" | "gizmoSpace" | "align",
): void {
  if (command === "align") {
    toggleAlignment(store);
  } else if (command === "gizmoSpace") {
    toggleGizmoSpace(store);
  } else {
    toggleGizmo(store, command === "gizmoMove" ? "move" : "rotate");
  }
}

// The commands that act on the selected row or rows.
function runSelectionCommand(
  store: ViewerStore,
  command: "rename" | "delete" | "group" | "ungroup",
): void {
  switch (command) {
    case "rename":
      renameSelection(store);
      return;
    case "delete":
      deleteSelection(store);
      return;
    case "group":
      requestGroup(store);
      return;
    case "ungroup":
      void ungroupSelection(store);
      return;
  }
}

// With nothing open, "Ouvrir…" is the list of the welcome dialog.
function openFromMenu(store: ViewerStore): void {
  if (store.state.openPantin === null) {
    store.update(withWelcomeShown(store.state, "all"));
  } else {
    requestClose(store);
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
      openFromMenu(store);
      return;
    case "documentation":
      openDocumentation(store);
      return;
    case "about":
      void openAbout(store);
      return;
    case "close":
      requestClose(store);
      return;
    case "save":
      void savePantin(store);
      return;
    case "import":
      return;
    case "cleanOrphans":
      void requestOrphanCleanup(store);
      return;
    case "gizmoMove":
    case "gizmoRotate":
    case "gizmoSpace":
    case "align":
      runPositioningCommand(store, command);
      return;
    case "newJoint":
      openJointForm(store);
      return;
    case "resetSimulation":
    case "releaseAllTags":
      void (command === "resetSimulation" ? resetSimulation(store) : releaseAllTags(store));
      return;
    case "rename":
    case "delete":
    case "group":
    case "ungroup":
      runSelectionCommand(store, command);
      return;
    case "deleteRedundantJoints":
      void requestRedundantJointsDeletion(store);
      return;
    default:
      runViewCommand(store, command, changeLanguage);
  }
}
