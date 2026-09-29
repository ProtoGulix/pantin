import { isLanguage } from "../i18n/translate.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { withListSelection } from "../session-state.ts";
import { bodyNodeId } from "../tree/node-ids.ts";
import { withRevealedNode, withSelectedNode } from "../tree/tree-state.ts";
import type { PanelIntents } from "../ui/panel-intents.ts";
import {
  cancelImport,
  changeImportOptions,
  chooseImportFile,
  confirmImport,
} from "./import-actions.ts";
import {
  cancelJointForm,
  changeJointType,
  editJointField,
  moveJoint,
  openJointForm,
  submitJointForm,
} from "./joint-actions.ts";
import { runMenuCommand } from "./menu-commands.ts";
import {
  createPantin,
  openPantin,
  refreshPantinList,
  renameNode,
  savePantin,
} from "./pantin-actions.ts";
import { commitPropertyEdit } from "./property-actions.ts";
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
  };
}

function treeIntents(store: ViewerStore) {
  return {
    selectNode: (nodeId: string) => {
      // No redraw when nothing changes, so a double-click lands on the same row element.
      const { selectedNodeId, contextMenu, renamingNodeId } = store.state;
      if (selectedNodeId !== nodeId || contextMenu !== null || renamingNodeId !== null) {
        store.update({ ...withSelectedNode(store.state, nodeId), contextMenu: null });
      }
    },
    setExpanded: (nodeId: string, expanded: boolean) => setExpanded(store, nodeId, expanded),
    activateNode: (nodeId: string) => activateNode(store, nodeId),
    startRename: (nodeId: string) => startRename(store, nodeId),
    commitRename: (nodeId: string, name: string) => void renameNode(store, nodeId, name),
    commitPropertyEdit: (target: EditTarget, value: string) =>
      void commitPropertyEdit(store, target, value),
    cancelRename: () => store.update({ ...store.state, renamingNodeId: null }),
    requestDelete: (nodeId: string) => requestDelete(store, nodeId),
    openContextMenu: (nodeId: string, x: number, y: number) =>
      store.update({ ...withSelectedNode(store.state, nodeId), contextMenu: { nodeId, x, y } }),
    closeContextMenu: () => store.update({ ...store.state, contextMenu: null }),
  };
}

function editIntents(store: ViewerStore) {
  return {
    requestClose: () => requestClose(store),
    savePantin: () => void savePantin(store),
    frameAll: () => store.ports.viewport().frameBodies(null),
    frameSelection: () => {
      const selected = store.state.selectedNodeId;
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
    editJointField: (fieldId: string, value: string) => editJointField(store, fieldId, value),
    changeJointType: (type: string) => changeJointType(store, type),
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
    runMenuCommand: (command) => runMenuCommand(store, command, changeLanguage),
    togglePropertyGroup: (groupId) =>
      store.update({
        ...store.state,
        collapsedPropertyGroups: toggledSet(store.state.collapsedPropertyGroups, groupId),
      }),
    dismissMessage: () => store.update({ ...store.state, message: null }),
    changeLanguage,
  };
}

/** A click in the 3D view selects the body and reveals it in the tree. */
export function selectBodyFromViewport(store: ViewerStore, bodyId: string | null): void {
  const pantinId = store.state.openPantin?.id;
  if (bodyId === null || pantinId === undefined) {
    store.update(withSelectedNode(store.state, null));
    return;
  }
  store.update(withRevealedNode(store.state, bodyNodeId(pantinId, bodyId)));
}

export function startViewer(store: ViewerStore): void {
  store.update(store.state);
  void refreshPantinList(store);
}
