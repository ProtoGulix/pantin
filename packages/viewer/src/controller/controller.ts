import { pickedNodeId } from "../assembly-display.ts";
import type { DeviceRef } from "../device-selection.ts";
import { isLanguage } from "../i18n/translate.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { nodeSelection, selectedNodeIdOf } from "../selection.ts";
import {
  withListSelection,
  withWelcomeFilter,
  withWelcomeHidden,
  withWelcomeTab,
} from "../session-state.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { withRevealedNode, withSelection } from "../tree/tree-state.ts";
import type { PanelIntents } from "../ui/panel-intents.ts";
import type { WelcomeTab } from "../viewer-state.ts";
import { actuatorIntents } from "./actuator-intents.ts";
import {
  createAssembly,
  dropBody,
  toggleAssemblyHidden,
  toggleAssemblyIsolated,
} from "./assembly-actions.ts";
import { clockIntents } from "./clock-actions.ts";
import { consoleIntents } from "./console-actions.ts";
import { diagramIntents, selectDevice } from "./diagram-actions.ts";
import { driveIntents } from "./drive-intents.ts";
import { setGizmoStep } from "./gizmo-actions.ts";
import {
  cancelImport,
  changeImportOptions,
  chooseImportFile,
  confirmImport,
  createPantinFromFile,
} from "./import-actions.ts";
import {
  cancelJointForm,
  changeJointType,
  chooseJointAxis,
  editJointField,
  moveJoint,
  openJointEditForm,
  openJointForm,
  reverseJointAxis,
  submitJointForm,
} from "./joint-actions.ts";
import { runMenuCommand } from "./menu-commands.ts";
import { showViewFromDirection } from "./navigation-actions.ts";
import {
  createPantin,
  openPantin,
  refreshPantinList,
  renameNode,
  savePantin,
} from "./pantin-actions.ts";
import { commitPropertyEdit } from "./property-actions.ts";
import { sensorIntents } from "./sensor-intents.ts";
import { requestClose, requestDelete, resolvePrompt } from "./session-actions.ts";
import { activateNode, frameNode, setExpanded, startRename } from "./tree-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Maps every intent to an action. Async actions report their own failures
// through the store, so their promises are deliberately not awaited.

function toggledSet(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(value)) {
    next.add(value);
  }
  return next;
}

function listIntents(store: ViewerStore) {
  return {
    selectListPantin: (pantinId: string) => store.update(withListSelection(store.state, pantinId)),
    openPantin: (pantinId: string) => void openPantin(store, pantinId),
    toggleCreatePantin: () =>
      store.update({ ...store.state, creatingPantin: !store.state.creatingPantin }),
    createPantin: (name: string) => void createPantin(store, name),
    createPantinFromFile: (file: File) => void createPantinFromFile(store, file),
    hideWelcome: () => store.update(withWelcomeHidden(store.state)),
    selectWelcomeTab: (tab: WelcomeTab) => store.update(withWelcomeTab(store.state, tab)),
    setWelcomeFilter: (text: string) => store.update(withWelcomeFilter(store.state, text)),
  };
}

function treeIntents(store: ViewerStore) {
  return {
    selectNode: (nodeId: string) => {
      // No redraw when nothing changes, so a double-click lands on the same row element.
      const { selection, contextMenu, renamingNodeId } = store.state;
      if (
        selectedNodeIdOf(selection) !== nodeId ||
        contextMenu !== null ||
        renamingNodeId !== null
      ) {
        store.update({ ...withSelection(store.state, nodeSelection(nodeId)), contextMenu: null });
      }
    },
    selectDevice: (device: DeviceRef) => selectDevice(store, device),
    revealNode: (nodeId: string) =>
      store.update({ ...withRevealedNode(store.state, nodeId), contextMenu: null }),
    setExpanded: (nodeId: string, expanded: boolean) => setExpanded(store, nodeId, expanded),
    activateNode: (nodeId: string) => activateNode(store, nodeId),
    startRename: (nodeId: string) => startRename(store, nodeId),
    commitRename: (nodeId: string, name: string) => void renameNode(store, nodeId, name),
    commitPropertyEdit: (target: EditTarget, value: string) =>
      void commitPropertyEdit(store, target, value),
    cancelRename: () => store.update({ ...store.state, renamingNodeId: null }),
    requestDelete: (nodeId: string) => requestDelete(store, nodeId),
    dropBody: (dragged: string, target: string) => dropBody(store, dragged, target),
    toggleAssemblyHidden: (nodeId: string) => toggleAssemblyHidden(store, nodeId),
    toggleAssemblyIsolated: (nodeId: string) => toggleAssemblyIsolated(store, nodeId),
    createAssembly: (nodeId: string) => {
      const pantinId = parseNodeId(nodeId)?.pantinId;
      if (pantinId !== undefined) {
        void createAssembly(store, pantinId);
      }
    },
    openContextMenu: (nodeId: string, x: number, y: number) =>
      store.update({
        ...withSelection(store.state, nodeSelection(nodeId)),
        contextMenu: { nodeId, x, y },
      }),
    closeContextMenu: () => store.update({ ...store.state, contextMenu: null }),
  };
}

function editIntents(store: ViewerStore) {
  return {
    requestClose: () => requestClose(store),
    savePantin: () => void savePantin(store),
    frameAll: () => store.ports.viewport().frameBodies(null),
    frameSelection: () => {
      const selected = selectedNodeIdOf(store.state.selection);
      if (selected !== null) {
        frameNode(store, selected);
      }
    },
    frameNode: (nodeId: string) => {
      store.update({ ...store.state, contextMenu: null });
      frameNode(store, nodeId);
    },
    resolvePrompt: (action: Parameters<PanelIntents["resolvePrompt"]>[0]) =>
      resolvePrompt(store, action),
  };
}

function importIntents(store: ViewerStore) {
  return {
    chooseImportFile: (file: File, targetPantinId: string | null) =>
      chooseImportFile(store, file, targetPantinId),
    changeImportUnit: (unit: string) => changeImportOptions(store, unit, undefined),
    changeImportUpAxis: (upAxis: string) => changeImportOptions(store, undefined, upAxis),
    confirmImport: () => void confirmImport(store),
    cancelImport: () => cancelImport(store),
  };
}

function jointIntents(store: ViewerStore) {
  return {
    openJointForm: () => openJointForm(store),
    openJointEditForm: (nodeId: string) => openJointEditForm(store, nodeId),
    editJointField: (fieldId: string, value: string) => editJointField(store, fieldId, value),
    changeJointType: (type: string) => changeJointType(store, type),
    chooseJointAxis: (direction: string) => chooseJointAxis(store, direction),
    reverseJointAxis: () => reverseJointAxis(store),
    submitJointForm: () => void submitJointForm(store),
    cancelJointForm: () => cancelJointForm(store),
    moveJoint: (pantinId: string, jointId: string, position: number) =>
      moveJoint(store, pantinId, jointId, position),
  };
}

export function createPanelIntents(store: ViewerStore): PanelIntents {
  const changeLanguage = (language: string) => {
    if (isLanguage(language)) {
      store.ports.storeLanguage(language);
      store.update({ ...store.state, language });
    }
  };
  return {
    ...listIntents(store),
    ...treeIntents(store),
    ...editIntents(store),
    ...importIntents(store),
    ...jointIntents(store),
    ...diagramIntents(store),
    ...driveIntents(store),
    ...actuatorIntents(store),
    ...sensorIntents(store),
    ...consoleIntents(store),
    ...clockIntents(store),
    runMenuCommand: (command) => runMenuCommand(store, command, changeLanguage),
    setGizmoStep: (field, text) => setGizmoStep(store, field, text),
    showViewFromDirection: (direction) => showViewFromDirection(store, direction),
    togglePropertyGroup: (groupId) =>
      store.update({
        ...store.state,
        collapsedPropertyGroups: toggledSet(store.state.collapsedPropertyGroups, groupId),
      }),
    dismissMessage: () => store.update({ ...store.state, message: null }),
    changeLanguage,
  };
}

/**
 * A click in the 3D view selects the body's assembly, a double click the body
 * (ADR 0019 point 13); either is revealed in the tree.
 */
export function selectBodyFromViewport(
  store: ViewerStore,
  bodyId: string | null,
  doubleClick: boolean,
): void {
  const open = store.state.openPantin;
  if (bodyId === null || open === null) {
    store.update(withSelection(store.state, null));
    return;
  }
  store.update(
    withRevealedNode(store.state, pickedNodeId(open.document, open.id, bodyId, doubleClick)),
  );
}

export function startViewer(store: ViewerStore): void {
  store.update(store.state);
  void refreshPantinList(store);
}
