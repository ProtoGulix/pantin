import type { RenamedTag, RenamedTagsResponse } from "@pantin/protocol";
import { createTranslator, pluralKey } from "../i18n/translate.ts";
import { infoMessage } from "../messages.ts";
import type { EditTarget } from "../properties/property-rows.ts";
import { assemblyNodeId, bodyNodeId, pantinNodeId } from "../tree/node-ids.ts";
import { withRevealedNode, withSelectedNode, withTreeStateCarried } from "../tree/tree-state.ts";
import type { ViewerState } from "../viewer-state.ts";
import { editPantin } from "./pantin-actions.ts";
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

// A renamed assembly key renames its tree node: keep it unfolded and
// selected. A moved body may land in a folded assembly: reveal it.
function stateAfterKeyEdit(
  store: ViewerStore,
  before: ViewerState,
  target: KeyTarget,
  value: string,
): ViewerState {
  if (target.kind === "assemblyKey") {
    const from = assemblyNodeId(target.pantinId, target.key);
    return withTreeStateCarried(before, store.state, from, assemblyNodeId(target.pantinId, value));
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
      ...infoMessage(pluralKey("message.tagsRenamed", count), { count }),
      detail: count === 0 ? null : renamedTagsText(answer.renamedTags),
    },
  });
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

/** Only an empty assembly can go: the core refuses the others, with a message. */
export async function deleteAssembly(store: ViewerStore, pantinId: string, key: string) {
  const pantin = await editPantin(store, pantinId, (id) => store.ports.api.deleteAssembly(id, key));
  if (pantin !== undefined) {
    store.update(withSelectedNode(store.state, pantinNodeId(pantinId)));
  }
}
