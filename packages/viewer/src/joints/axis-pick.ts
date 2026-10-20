import {
  type FaceFile,
  JOINT_COORDINATE_UNITS,
  type JointAxisFromFaceRequest,
  type JointAxisFromFaceResponse,
} from "@pantin/protocol";
import type { FaceHighlight } from "../alignment/alignment-session.ts";
import { alignmentHighlightsOf, isAligning } from "../alignment/alignment-view.ts";
import { faceAtTriangle, primitiveOfPointers } from "../alignment/face-lookup.ts";
import type { ViewportPick } from "../alignment/pick-resolution.ts";
import { isPickingNormalTo } from "../navigation/normal-to.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { formatDisplayNumber, metresToMillimetres } from "../units.ts";
import type { ViewerState } from "../viewer-state.ts";
import type { AxisPickState } from "./axis-pick-state.ts";
import { type JointFormState, VECTOR_AXES, vectorFieldId } from "./joint-form.ts";

// "Prendre l'axe sur une face" (ADR 0041 points 1 and 3): one pick in the 3D
// view fills the joint form's origin and axis. The geometry is the core's;
// this module only decides when the mode lives and what a click asks.

/** Only a joint that moves has an axis worth picking, and the route needs a stored joint. */
export function canPickAxis(form: JointFormState | null): boolean {
  return form !== null && form.jointId !== null && JOINT_COORDINATE_UNITS[form.type] !== null;
}

/** Enters the mode; one tool at a time, so an alignment or the gizmo ends. */
export function withAxisPickStarted(state: ViewerState): ViewerState {
  const { jointForm: form, openPantin: open } = state;
  if (form === null || form.jointId === null || open === null || !canPickAxis(form)) {
    return state;
  }
  const axisPick: AxisPickState = {
    pantinId: open.id,
    jointId: form.jointId,
    nodeId: selectedNodeIdOf(state.selection),
    waiting: true,
    highlight: null,
  };
  return { ...state, axisPick, alignment: null, gizmoMode: null, message: null };
}

/** The mode ends with its form, its Pantin, its selection, or when another tool starts. */
export function withAxisPickRules(state: ViewerState): ViewerState {
  const { axisPick, jointForm, openPantin } = state;
  if (axisPick === null) {
    return state;
  }
  const alive =
    jointForm !== null &&
    canPickAxis(jointForm) &&
    jointForm.jointId === axisPick.jointId &&
    openPantin?.id === axisPick.pantinId &&
    selectedNodeIdOf(state.selection) === axisPick.nodeId &&
    state.alignment === null &&
    state.gizmoMode === null;
  return alive ? state : { ...state, axisPick: null };
}

/** True while a click in the 3D view is the axis pick. */
export function isPickingAxis(state: ViewerState): boolean {
  return state.axisPick?.waiting === true;
}

/** True while clicks in the 3D view are picks (alignment, axis, "Normal To") and not selections. */
export function isPickingFaces(state: ViewerState): boolean {
  return isAligning(state) || isPickingAxis(state) || isPickingNormalTo(state);
}

/** The faces to tint: the alignment's picks, or the face the axis was taken on. */
export function pickHighlightsOf(state: ViewerState): FaceHighlight[] {
  const picked = state.axisPick?.highlight;
  return picked === null || picked === undefined ? alignmentHighlightsOf(state) : [picked];
}

export type AxisPickRequest =
  | { ok: true; request: JointAxisFromFaceRequest; highlight: FaceHighlight }
  // The face file exists but has no face for this triangle.
  | { ok: false; refusal: "unmappedFace" };

/**
 * What a click asks the core. Without a face file the request still goes, with
 * face 0: the core refuses with the reason, which the form shows (ADR 0041).
 */
export function axisPickRequestOf(click: ViewportPick, faceFile: FaceFile | null): AxisPickRequest {
  const request = (faceIndex: number): JointAxisFromFaceRequest => ({
    bodyId: click.bodyId,
    faceIndex,
    hitPoint: [click.point[0], click.point[1], click.point[2]],
  });
  const highlight = (firstTriangle: number, triangleCount: number): FaceHighlight => ({
    bodyId: click.bodyId,
    meshIndex: click.meshIndex,
    side: "target",
    firstTriangle,
    triangleCount,
  });
  if (faceFile === null) {
    return { ok: true, request: request(0), highlight: highlight(click.triangle, 1) };
  }
  const primitive = primitiveOfPointers(click.pointers);
  const picked = primitive === null ? null : faceAtTriangle(faceFile, primitive, click.triangle);
  return picked === null
    ? { ok: false, refusal: "unmappedFace" }
    : {
        ok: true,
        request: request(picked.face),
        highlight: highlight(picked.firstTriangle, picked.triangleCount),
      };
}

// Six decimals keep an oblique axis a unit vector to the eye; never "-0".
function axisText(component: number): string {
  const rounded = Math.round(component * 1e6) / 1e6;
  return String(rounded === 0 ? 0 : rounded);
}

/** The core's answer in the form's fields: origin in millimetres. Nothing is saved. */
export function withAxisAnswer(
  form: JointFormState,
  answer: JointAxisFromFaceResponse,
): JointFormState {
  const values = { ...form.values };
  for (const [index, axis] of VECTOR_AXES.entries()) {
    values[vectorFieldId("origin", axis)] = formatDisplayNumber(
      metresToMillimetres(answer.origin[index] ?? 0),
    );
    values[vectorFieldId("axis", axis)] = axisText(answer.axis[index] ?? 0);
  }
  return { ...form, values, customAxis: false };
}
