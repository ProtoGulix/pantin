import { isAligning } from "../alignment/alignment-view.ts";
import { type CentralLayout, showsViewport } from "../central-layout.ts";
import type { DeviceKind } from "../device-selection.ts";
import type { GizmoSpace } from "../gizmo/gizmo-space.ts";
import { canUseGizmo } from "../gizmo/gizmo-spec.ts";
import type { DragKind } from "../gizmo/placement-snapping.ts";
import { groupingTargetOf, ungroupTargetOf } from "../grouping/grouping-model.ts";
import type { Language } from "../i18n/translate.ts";
import type { NavigationSettings } from "../navigation/navigation-settings.ts";
import { type Selection, selectedNodeIdOf, selectedNodeIdsOf } from "../selection.ts";
import type { ThemeChoice } from "../theme/theme.ts";
import { type NodeRef, parseNodeId } from "../tree/node-ids.ts";
import type { ViewerState } from "../viewer-state.ts";

// What the enable rules look at, computed once per state.
export interface MenuContext {
  editing: boolean;
  busy: boolean;
  unsavedChanges: boolean;
  // A file of the Pantin folder was modified outside Pantin: saving overwrites it (ADR 0063).
  changedOutside: boolean;
  importing: boolean;
  hasBodies: boolean;
  selectedKind: NodeRef["kind"] | DeviceKind | null;
  // The selected rows can be grouped, or the selected group dissolved (ADR 0055 point 12).
  canGroup: boolean;
  canUngroup: boolean;
  language: Language;
  themeChoice: ThemeChoice;
  inspectorOpen: boolean;
  consoleOpen: boolean;
  centralLayout: CentralLayout;
  // The placement gizmo (ADR 0034): on, and whether one assembly is selected to use it on.
  gizmoMode: DragKind | null;
  gizmoSpace: GizmoSpace;
  gizmoAvailable: boolean;
  // An alignment is under way (ADR 0035).
  aligning: boolean;
  // The mouse preset and the other settings of the 3D view (ADR 0036).
  navigation: NavigationSettings;
  // "Vue normale à une face" waits for a click (ADR 0036).
  normalTo: boolean;
  // The standard views need the 3D view to be on screen (ADR 0036 point 4).
  viewsAvailable: boolean;
}

function selectedKindOf(selection: Selection | null): MenuContext["selectedKind"] {
  if (selection === null) {
    return null;
  }
  return selection.kind === "node" ? (parseNodeId(selection.nodeId)?.kind ?? null) : selection.kind;
}

function groupingAvailability(state: ViewerState): Pick<MenuContext, "canGroup" | "canUngroup"> {
  const open = state.openPantin;
  if (open === null) {
    return { canGroup: false, canUngroup: false };
  }
  const nodeIds = selectedNodeIdsOf(state.selection, state.multiSelectedNodeIds);
  return {
    canGroup: groupingTargetOf(open.document, open.id, nodeIds) !== null,
    canUngroup: ungroupTargetOf(open.document, open.id, selectedNodeIdOf(state.selection)) !== null,
  };
}

export function menuContext(state: ViewerState): MenuContext {
  return {
    ...groupingAvailability(state),
    editing: state.openPantin !== null,
    busy: state.pendingRequestCount > 0,
    unsavedChanges: state.openPantin?.unsavedChanges ?? false,
    changedOutside: (state.openPantin?.changedOutside.length ?? 0) > 0,
    importing: state.importInProgress,
    hasBodies: (state.openPantin?.document.bodies.length ?? 0) > 0,
    selectedKind: selectedKindOf(state.selection),
    language: state.language,
    themeChoice: state.themeChoice,
    inspectorOpen: state.inspectorOpen,
    consoleOpen: state.console.open,
    centralLayout: state.centralLayout,
    gizmoMode: state.gizmoMode,
    gizmoSpace: state.gizmoSpace,
    gizmoAvailable: canUseGizmo(state),
    aligning: isAligning(state),
    navigation: state.navigation,
    normalTo: state.normalTo,
    viewsAvailable: state.openPantin !== null && showsViewport(state.centralLayout),
  };
}

/** What a plain Escape does once every component that handles it has had its say. */
export type EscapeCommand = "turnToolOff";

/**
 * The last link of the Escape chain (ADR 0039 point 6): after the gizmo drag,
 * the text field, the menus and prompts, a positioning tool goes off. An open
 * context menu closes first.
 */
export function escapeCommand(state: ViewerState): EscapeCommand | null {
  if (state.contextMenu !== null) {
    return null;
  }
  return state.gizmoMode !== null ||
    state.alignment !== null ||
    state.axisPick !== null ||
    state.normalTo
    ? "turnToolOff"
    : null;
}
