import type { Vector3 } from "@pantin/protocol";
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

function formPreview(form: JointFormState): JointPreview {
  const axis = formVector(form, "axis");
  return {
    parentBodyId: form.values[FIELD_PARENT] ?? "",
    childBodyId: form.values[FIELD_CHILD] ?? "",
    origin: formVector(form, "origin"),
    axis: axis?.some((component) => component !== 0) ? axis : null,
  };
}

/** The form wins over the selection: it is what the user is working on. */
export function jointPreviewOf(state: ViewerState): JointPreview | null {
  if (state.jointForm !== null) {
    return formPreview(state.jointForm);
  }
  const ref = state.selectedNodeId === null ? null : parseNodeId(state.selectedNodeId);
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
      };
}
