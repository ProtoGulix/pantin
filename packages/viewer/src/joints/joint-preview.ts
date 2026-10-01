import type { Vector3 } from "@pantin/protocol";
import { actuatorOfJoint } from "../actuators/actuator-joints.ts";
import { selectedNodeIdOf } from "../selection.ts";
import { parseNodeId } from "../tree/node-ids.ts";
import { millimetresToMetres } from "../units.ts";
import type { ViewerState } from "../viewer-state.ts";
import {
  FIELD_CHILD,
  FIELD_PARENT,
  type JointFormState,
  parseNumber,
  VECTOR_AXES,
  vectorFieldId,
} from "./joint-form.ts";

// What the 3D view shows of the joint being created or the selected one: its
// two bodies, coloured, and an arrow along its axis in the positive sense.
// Core frame, SI, reference configuration.

export interface JointPreview {
  parentBodyId: string;
  childBodyId: string;
  // Null while the form holds a value that is not a number: no arrow then.
  origin: Vector3 | null;
  // Null as well for the zero vector, which has no direction.
  axis: Vector3 | null;
  // An actuator moves this joint (ADR 0028): the arrow says so by its colour.
  driven: boolean;
}

function formVector(form: JointFormState, vector: "origin" | "axis"): Vector3 | null {
  const [x, y, z] = VECTOR_AXES.map((axis) =>
    parseNumber(form.values[vectorFieldId(vector, axis)]),
  );
  if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isFinite)) {
    return null;
  }
  return vector === "origin"
    ? [millimetresToMetres(x), millimetresToMetres(y), millimetresToMetres(z)]
    : [x, y, z];
}

function isDriven(state: ViewerState, jointId: string | null): boolean {
  const document = state.openPantin?.document;
  return (
    jointId !== null && document !== undefined && actuatorOfJoint(document, jointId) !== undefined
  );
}

function formPreview(form: JointFormState, driven: boolean): JointPreview {
  const axis = formVector(form, "axis");
  return {
    driven,
    parentBodyId: form.values[FIELD_PARENT] ?? "",
    childBodyId: form.values[FIELD_CHILD] ?? "",
    origin: formVector(form, "origin"),
    axis: axis?.some((component) => component !== 0) ? axis : null,
  };
}

/** The form wins over the selection: it is what the user is working on. */
export function jointPreviewOf(state: ViewerState): JointPreview | null {
  if (state.jointForm !== null) {
    return formPreview(state.jointForm, isDriven(state, state.jointForm.jointId));
  }
  const nodeId = selectedNodeIdOf(state.selection);
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  const joint =
    ref?.kind === "joint"
      ? state.openPantin?.document.joints.find((candidate) => candidate.id === ref.jointId)
      : undefined;
  return joint === undefined
    ? null
    : {
        parentBodyId: joint.parent,
        childBodyId: joint.child,
        origin: joint.origin,
        axis: joint.axis,
        driven: isDriven(state, joint.id),
      };
}
