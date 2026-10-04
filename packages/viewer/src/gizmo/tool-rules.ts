import { withoutPicks } from "../alignment/alignment-session.ts";
import { showsViewport } from "../central-layout.ts";
import { nodeSelection, selectedNodeIdOf } from "../selection.ts";
import { assemblyNodeId, parseNodeId } from "../tree/node-ids.ts";
import { withSelection } from "../tree/tree-state.ts";
import type { ViewerState } from "../viewer-state.ts";
import { toolAssemblyKeyOf } from "./gizmo-spec.ts";

// The rules tying the positioning tools to the selection (ADR 0039 point 3).
// Pure, applied by the store to every new state, so that no source of
// selection (tree, 3D view, diagram, deletion) has to know about the tools.

const PLACEMENT_GROUP_ID = "assemblyPlacement";

export function isToolOn(state: ViewerState): boolean {
  return state.gizmoMode !== null || state.alignment !== null;
}

function selectedKind(state: ViewerState) {
  const nodeId = selectedNodeIdOf(state.selection);
  return nodeId === null ? null : (parseNodeId(nodeId)?.kind ?? null);
}

/**
 * A tool lives while an assembly or a body is selected, the 3D view is shown
 * and the inspector, which holds its controls, is open. A gizmo follows the
 * selection to another assembly; an alignment restarts there with no picks
 * (the kind and the parameters stay).
 */
export function withToolRules(state: ViewerState): ViewerState {
  const { alignment } = state;
  if (!isToolOn(state)) {
    return state;
  }
  const kind = selectedKind(state);
  const key = toolAssemblyKeyOf(state);
  if (
    key === null ||
    state.openPantin === null ||
    !showsViewport(state.centralLayout) ||
    !state.inspectorOpen
  ) {
    return { ...state, gizmoMode: null, alignment: null };
  }
  const moved =
    alignment !== null &&
    kind === "assembly" &&
    (alignment.assemblyKey !== key || alignment.pantinId !== state.openPantin.id);
  return moved
    ? {
        ...state,
        alignment: { ...withoutPicks(alignment), assemblyKey: key, pantinId: state.openPantin.id },
      }
    : state;
}

/**
 * What G, R and A prepare before a tool starts: a selected body gives way to
 * its assembly, the inspector opens and "Positionnement" unfolds. The focus
 * is left alone.
 */
export function withToolTarget(state: ViewerState): ViewerState {
  const key = toolAssemblyKeyOf(state);
  const collapsedPropertyGroups = new Set(state.collapsedPropertyGroups);
  collapsedPropertyGroups.delete(PLACEMENT_GROUP_ID);
  const prepared = { ...state, inspectorOpen: true, collapsedPropertyGroups };
  if (selectedKind(state) !== "body" || key === null || state.openPantin === null) {
    return prepared;
  }
  return withSelection(prepared, nodeSelection(assemblyNodeId(state.openPantin.id, key)));
}

/** A body is selected: a tool command then moves the selection to its assembly. */
export function isBodySelected(state: ViewerState): boolean {
  return selectedKind(state) === "body";
}
