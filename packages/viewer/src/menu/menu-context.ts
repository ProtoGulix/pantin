import type { DeviceKind } from "../device-selection.ts";
import type { Language } from "../i18n/translate.ts";
import type { Selection } from "../selection.ts";
import { type NodeRef, parseNodeId } from "../tree/node-ids.ts";
import type { ViewerState } from "../viewer-state.ts";

// What the enable rules look at, computed once per state.
export interface MenuContext {
  editing: boolean;
  busy: boolean;
  unsavedChanges: boolean;
  importing: boolean;
  hasBodies: boolean;
  selectedKind: NodeRef["kind"] | DeviceKind | null;
  language: Language;
  inspectorOpen: boolean;
  diagramShown: boolean;
}

function selectedKindOf(selection: Selection | null): MenuContext["selectedKind"] {
  if (selection === null) {
    return null;
  }
  return selection.kind === "node" ? (parseNodeId(selection.nodeId)?.kind ?? null) : selection.kind;
}

export function menuContext(state: ViewerState): MenuContext {
  return {
    editing: state.openPantin !== null,
    busy: state.pendingRequestCount > 0,
    unsavedChanges: state.openPantin?.unsavedChanges ?? false,
    importing: state.importInProgress,
    hasBodies: (state.openPantin?.document.bodies.length ?? 0) > 0,
    selectedKind: selectedKindOf(state.selection),
    language: state.language,
    inspectorOpen: state.inspectorOpen,
    diagramShown: state.diagramShown,
  };
}
