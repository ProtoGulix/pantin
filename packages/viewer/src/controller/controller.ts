import { isLanguage } from "../i18n/translate.ts";
import { bodyNodeId } from "../tree/node-ids.ts";
import { withRevealedNode, withSelectedNode } from "../tree/tree-state.ts";
import type { PanelIntents } from "../ui/panel-intents.ts";
import {
  cancelImport,
  changeImportOptions,
  chooseImportFile,
  confirmImport,
} from "./import-actions.ts";
import { createPantin, refreshPantinList, renameNode, savePantin } from "./pantin-actions.ts";
import { activateNode, frameNode, setExpanded, startRename } from "./tree-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Maps every panel intent to an action. Async actions report their own
// failures through the store, so their promises are deliberately not awaited.

function toggledSet(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(value)) {
    next.add(value);
  }
  return next;
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
    setExpanded: (nodeId: string, expanded: boolean) => void setExpanded(store, nodeId, expanded),
    activateNode: (nodeId: string) => void activateNode(store, nodeId),
    startRename: (nodeId: string) => startRename(store, nodeId),
    commitRename: (nodeId: string, name: string) => void renameNode(store, nodeId, name),
    cancelRename: () => store.update({ ...store.state, renamingNodeId: null }),
    openContextMenu: (nodeId: string, x: number, y: number) =>
      store.update({ ...withSelectedNode(store.state, nodeId), contextMenu: { nodeId, x, y } }),
    closeContextMenu: () => store.update({ ...store.state, contextMenu: null }),
  };
}

function toolbarIntents(store: ViewerStore) {
  return {
    toggleCreatePantin: () =>
      store.update({ ...store.state, creatingPantin: !store.state.creatingPantin }),
    createPantin: (name: string) => void createPantin(store, name),
    savePantin: () => void savePantin(store),
    frameAll: () => store.ports.viewport().frameBodies(null),
    frameSelection: () => {
      const selected = store.state.selectedNodeId;
      if (selected !== null) {
        void frameNode(store, selected);
      }
    },
    frameNode: (nodeId: string) => {
      store.update({ ...store.state, contextMenu: null });
      void frameNode(store, nodeId);
    },
  };
}

function importIntents(store: ViewerStore) {
  return {
    chooseImportFile: (file: File, targetPantinId: string | null) =>
      void chooseImportFile(store, file, targetPantinId),
    changeImportUnit: (unit: string) => changeImportOptions(store, unit, undefined),
    changeImportUpAxis: (upAxis: string) => changeImportOptions(store, undefined, upAxis),
    confirmImport: () => void confirmImport(store),
    cancelImport: () => cancelImport(store),
  };
}

export function createPanelIntents(store: ViewerStore): PanelIntents {
  return {
    ...treeIntents(store),
    ...toolbarIntents(store),
    ...importIntents(store),
    togglePropertyGroup: (groupId) =>
      store.update({
        ...store.state,
        collapsedPropertyGroups: toggledSet(store.state.collapsedPropertyGroups, groupId),
      }),
    dismissMessage: () => store.update({ ...store.state, message: null }),
    changeLanguage: (language) => {
      if (isLanguage(language)) {
        store.ports.storeLanguage(language);
        store.update({ ...store.state, language });
      }
    },
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
