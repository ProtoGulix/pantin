import type { RenamedTag, RenamedTagsResponse } from "@pantin/protocol";
import { withAssemblyContentsDeleted } from "../assembly-deletion-state.ts";
import {
  type AssemblyDisplay,
  withAssemblyHiddenToggled,
  withAssemblyIsolationToggled,
  withAssemblyKeyRenamed,
  withAssemblyRemoved,
} from "../assembly-display.ts";
import { createTranslator, pluralKey } from "../i18n/translate.ts";
import { infoMessage } from "../messages.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { nodeSelection } from "../selection.ts";
import { withAssemblyDeleteRequested } from "../session-state.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId, parseNodeId } from "../tree/node-ids.ts";
import { bodyMoveOf } from "../tree/tree-drop.ts";
import { withRevealedNode, withSelection, withTreeStateCarried } from "../tree/tree-state.ts";
import type { ViewerState } from "../viewer-state.ts";
import { editPantin, refreshPantinList } from "./pantin-actions.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Assemblies and keys (ADR 0019). Every key change may rename tags: the core
// lists them, and the message line shows them, since the PLC side must follow.

type KeyTarget = Extract<EditTarget, { kind: "assemblyKey" | "tagKey" | "bodyAssembly" }>;

function sendKeyEdit(store: ViewerStore, target: KeyTarget, value: string) {
  const { api } = store.ports;
  return editPantin(store, target.pantinId, (pantinId): Promise<RenamedTagsResponse> => {
    switch (target.kind) {
      case "assemblyKey":
        return api.renameAssemblyKey(pantinId, target.key, value);
      case "tagKey":
        return api.renameTagKey(pantinId, target.jointId, value);
      case "bodyAssembly":
        return api.moveBody(pantinId, target.bodyId, value);
    }
  });
}

function renamedTagsText(renamedTags: readonly RenamedTag[]): string {
  return renamedTags.map(({ from, to }) => `${from} → ${to}`).join(", ");
}

// A renamed assembly key renames its tree node: keep it unfolded, selected,
// hidden or isolated as it was. A moved body may land in a folded assembly: reveal it.
function stateAfterKeyEdit(
  store: ViewerStore,
  before: ViewerState,
  target: KeyTarget,
  value: string,
): ViewerState {
  if (target.kind === "assemblyKey") {
    const from = assemblyNodeId(target.pantinId, target.key);
    const carried = withTreeStateCarried(
      before,
      store.state,
      from,
      assemblyNodeId(target.pantinId, value),
    );
    const assemblyDisplay = withAssemblyKeyRenamed(before.assemblyDisplay, target.key, value);
    return { ...carried, assemblyDisplay };
  }
  return target.kind === "bodyAssembly"
    ? withRevealedNode(store.state, bodyNodeId(target.pantinId, target.bodyId))
    : store.state;
}

export async function commitKeyEdit(
  store: ViewerStore,
  target: KeyTarget,
  value: string,
): Promise<void> {
  const before = store.state;
  const answer = await sendKeyEdit(store, target, value);
  if (answer === undefined) {
    return;
  }
  const count = answer.renamedTags.length;
  store.update({
    ...stateAfterKeyEdit(store, before, target, value),
    message: {
      ...infoMessage(pluralKey("message.tagsRenamed", count, store.state.language), { count }),
      detail: count === 0 ? null : renamedTagsText(answer.renamedTags),
    },
  });
}

function withDisplayOf(
  store: ViewerStore,
  nodeId: string,
  change: (display: AssemblyDisplay, key: string) => AssemblyDisplay,
): void {
  const ref = parseNodeId(nodeId);
  if (ref?.kind === "assembly") {
    const assemblyDisplay = change(store.state.assemblyDisplay, ref.key);
    store.update({ ...store.state, assemblyDisplay, contextMenu: null });
  }
}

export function toggleAssemblyHidden(store: ViewerStore, nodeId: string): void {
  const keys = store.state.openPantin?.document.assemblies.map((assembly) => assembly.key) ?? [];
  withDisplayOf(store, nodeId, (display, key) => withAssemblyHiddenToggled(display, key, keys));
}

export function toggleAssemblyIsolated(store: ViewerStore, nodeId: string): void {
  withDisplayOf(store, nodeId, withAssemblyIsolationToggled);
}

/** A body dropped in the tree: the same move as the properties' select. */
export function dropBody(store: ViewerStore, draggedNodeId: string, targetNodeId: string): void {
  const open = store.state.openPantin;
  const move = open === null ? null : bodyMoveOf(open.document, draggedNodeId, targetNodeId);
  if (open !== null && move !== null) {
    const target = { kind: "bodyAssembly" as const, pantinId: open.id, bodyId: move.bodyId };
    void commitKeyEdit(store, target, move.assembly);
  }
}

/** A new assembly with a default name, selected and ready to be renamed. */
export async function createAssembly(store: ViewerStore, pantinId: string): Promise<void> {
  const before = new Set(store.state.openPantin?.document.assemblies.map(({ key }) => key));
  const name = createTranslator(store.state.language)("assembly.defaultName");
  const pantin = await editPantin(store, pantinId, (id) =>
    store.ports.api.createAssembly(id, name),
  );
  const created = pantin?.document.assemblies.find(({ key }) => !before.has(key));
  if (created === undefined) {
    return;
  }
  const nodeId = assemblyNodeId(pantinId, created.key);
  store.update({ ...withRevealedNode(store.state, nodeId), renamingNodeId: nodeId });
}

/** An empty assembly goes at once, as before: nothing is lost, no prompt. */
export async function deleteAssembly(store: ViewerStore, pantinId: string, key: string) {
  const pantin = await editPantin(store, pantinId, (id) => store.ports.api.deleteAssembly(id, key));
  if (pantin !== undefined) {
    const assemblyDisplay = withAssemblyRemoved(store.state.assemblyDisplay, key);
    store.update({
      ...withSelection(store.state, nodeSelection(pantinNodeId(pantinId))),
      assemblyDisplay,
    });
  }
}

/**
 * Any other assembly: the core's dry run first (ADR 0037 point 7). Its
 * refusal (409) goes to the message line and no prompt opens.
 */
export async function requestAssemblyDeletion(
  store: ViewerStore,
  pantinId: string,
  key: string,
): Promise<void> {
  await store.run(
    () => store.ports.api.previewAssemblyDeletion(pantinId, key),
    (current, contents) =>
      store.requestedPantinId === pantinId
        ? withAssemblyDeleteRequested(current, contents)
        : current,
  );
}

/** "Supprimer" on the prompt: the deletion with contents, then the viewer forgets what went. */
export async function confirmDeleteAssembly(store: ViewerStore): Promise<void> {
  const open = store.state.openPantin;
  const pending = store.state.pendingDeleteAssembly;
  const exists = open?.document.assemblies.some(({ key }) => key === pending?.key) ?? false;
  if (open === null || pending === null || !exists) {
    return;
  }
  await store.run(
    () => store.ports.api.deleteAssemblyWithContents(open.id, pending.key),
    (current, response) =>
      store.requestedPantinId === response.pantin.id
        ? withAssemblyContentsDeleted(current, response)
        : current,
  );
  await refreshPantinList(store);
}
