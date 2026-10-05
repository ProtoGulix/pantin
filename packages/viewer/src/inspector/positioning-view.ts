import type { PantinResponse } from "@pantin/protocol";
import { type AlignmentView, buildAlignmentView, isAligning } from "../alignment/alignment-view.ts";
import { canUseGizmo, toolAssemblyKeyOf } from "../gizmo/gizmo-spec.ts";
import type { SnapSteps } from "../gizmo/placement-snapping.ts";
import type { MessageKey, Translate } from "../i18n/translate.ts";
import type { MenuCommand } from "../menu/menu-model.ts";
import { placementFeedbackOf } from "../placement-feedback.ts";
import { restorableOf } from "../previous-placement.ts";
import { GROUP_TITLES } from "../properties/group-titles.ts";
import { assemblyPlacementGroup } from "../properties/placement-groups.ts";
import type { PropertyGroup } from "../properties/property-rows.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import type { ViewerState } from "../viewer-state.ts";

// The "Positionnement" section of the inspector (ADR 0039 points 1 and 2): for
// an assembly the anchor and the six placement fields, the three tools and the
// step of the gizmo that is on; for a body, the assembly it is placed with and
// the same tools. Nothing for any other selection.

type PositioningCommand = Extract<
  MenuCommand,
  "gizmoMove" | "gizmoRotate" | "gizmoSpace" | "align"
>;

interface PositioningToolView {
  command: PositioningCommand;
  label: string;
  pressed: boolean;
  disabled: boolean;
}

interface PositioningStepView {
  field: keyof SnapSteps;
  label: string;
  value: string;
}

// "Rétablir le placement précédent" (point 11): off with the reason as tooltip.
interface PositioningRestoreView {
  label: string;
  // The label, or the label and why it is off.
  title: string;
  disabled: boolean;
}

export interface PositioningView {
  title: string;
  // An assembly: its anchor and placement fields, foldable like any group.
  group: PropertyGroup | null;
  // A body: where it is placed from; null for an assembly.
  bodyLine: string | null;
  tools: PositioningToolView[];
  step: PositioningStepView | null;
  restore: PositioningRestoreView;
  // While an alignment is under way (ADR 0039 point 4): shown below the tools,
  // for a body too, as the session is bound to its assembly, not to the selection.
  alignment: AlignmentView | null;
}

function toolsOf(state: ViewerState, t: Translate): PositioningToolView[] {
  const aligning = isAligning(state);
  // The same rules as the Edit menu: an assembly selected and the 3D view shown;
  // an alignment can always be stopped.
  const gizmoDisabled = !canUseGizmo(state);
  const tool = (
    command: PositioningCommand,
    label: MessageKey,
    pressed: boolean,
    disabled: boolean,
  ) => ({ command, label: t(label), pressed, disabled });
  return [
    tool("gizmoMove", "positioning.move", state.gizmoMode === "move", gizmoDisabled),
    tool("gizmoRotate", "positioning.rotate", state.gizmoMode === "rotate", gizmoDisabled),
    // Pressed on the assembly's own axes; the tooltip names the axes in use.
    tool(
      "gizmoSpace",
      state.gizmoSpace === "local" ? "positioning.spaceLocal" : "positioning.spaceGlobal",
      state.gizmoSpace === "local",
      gizmoDisabled,
    ),
    tool("align", "positioning.align", aligning, gizmoDisabled && !aligning),
  ];
}

function restoreOf(state: ViewerState, t: Translate): PositioningRestoreView {
  const key = toolAssemblyKeyOf(state);
  const label = t("positioning.restore");
  const restorable = key === null ? null : restorableOf(state, key);
  if (restorable?.kind === "ready") {
    return { label, title: label, disabled: false };
  }
  const reason = t(
    restorable?.kind === "anchorChanged"
      ? "positioning.restoreAnchorChanged"
      : "positioning.restoreNothing",
  );
  return { label, title: t("inspector.disabledTool", { name: label, reason }), disabled: true };
}

function stepOf(state: ViewerState, t: Translate): PositioningStepView | null {
  const { gizmoMode, gizmoSteps } = state;
  if (gizmoMode === null) {
    return null;
  }
  const field = gizmoMode === "move" ? "translationMillimetres" : "rotationDegrees";
  return {
    field,
    label: t(gizmoMode === "move" ? "positioning.stepTranslation" : "positioning.stepRotation"),
    value: String(gizmoSteps[field]),
  };
}

function selectedRef(state: ViewerState, pantin: PantinResponse) {
  const nodeId = selectedNodeIdOf(state.selection);
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  return ref !== null && ref.pantinId === pantin.id ? ref : null;
}

export function buildPositioningView(
  state: ViewerState,
  t: Translate,
  clockRunning: boolean,
): PositioningView | null {
  const pantin = state.openPantin;
  const ref = pantin === null ? null : selectedRef(state, pantin);
  if (pantin === null || ref === null) {
    return null;
  }
  const { document } = pantin;
  const title = t(GROUP_TITLES.assemblyPlacement);
  if (ref.kind === "assembly") {
    const assembly = document.assemblies.find((candidate) => candidate.key === ref.key);
    if (assembly === undefined) {
      return null;
    }
    const feedback = placementFeedbackOf(
      state.placementDraft,
      state.placementInvalid,
      pantin.id,
      assembly.key,
    );
    const draft = assemblyPlacementGroup(assembly, pantin, t, feedback);
    const collapsed = state.collapsedPropertyGroups.has(draft.id);
    return {
      title,
      group: { ...draft, title, collapsed },
      bodyLine: null,
      tools: toolsOf(state, t),
      step: stepOf(state, t),
      restore: restoreOf(state, t),
      alignment: buildAlignmentView(state, t, clockRunning),
    };
  }
  if (ref.kind === "body") {
    const body = document.bodies.find((candidate) => candidate.id === ref.bodyId);
    const assembly = document.assemblies.find((candidate) => candidate.key === body?.assembly);
    return body === undefined
      ? null
      : {
          title,
          group: null,
          bodyLine: t("positioning.bodyLine", { name: assembly?.name ?? body.assembly }),
          tools: toolsOf(state, t),
          step: null,
          restore: restoreOf(state, t),
          alignment: buildAlignmentView(state, t, clockRunning),
        };
  }
  return null;
}
