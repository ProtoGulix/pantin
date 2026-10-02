import type { PantinDocument, Vector3 } from "@pantin/protocol";
import { actuatorOfJoint } from "../actuators/actuator-joints.ts";
import type { Vector3Tuple } from "../frames.ts";
import { inBodyFrame } from "../placement-frame.ts";
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
// Core frame, SI, reference configuration. Origin and axis are given as seen
// from the parent body's own frame (placement-frame.ts), because the arrow
// follows that body's pose.

export interface JointPreview {
  parentBodyId: string;
  childBodyId: string;
  // Null while the form holds a value that is not a number: no arrow then.
  origin: Vector3Tuple | null;
  // Null as well for the zero vector, which has no direction.
  axis: Vector3Tuple | null;
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

// Origin and axis arrive in the frame of the parent body's assembly (ADR 0033).
function previewOf(
  document: PantinDocument | undefined,
  joint: { parentBodyId: string; childBodyId: string; driven: boolean },
  origin: Vector3 | null,
  axis: Vector3 | null,
): JointPreview {
  const parent = document?.bodies.find((body) => body.id === joint.parentBodyId);
  const drawn = inBodyFrame(origin ?? [0, 0, 0], axis ?? [0, 0, 1], parent?.placement);
  return {
    ...joint,
    origin: origin === null ? null : drawn.origin,
    axis: axis === null ? null : drawn.axis,
  };
}

function formPreview(
  document: PantinDocument | undefined,
  form: JointFormState,
  driven: boolean,
): JointPreview {
  const axis = formVector(form, "axis");
  return previewOf(
    document,
    {
      driven,
      parentBodyId: form.values[FIELD_PARENT] ?? "",
      childBodyId: form.values[FIELD_CHILD] ?? "",
    },
    formVector(form, "origin"),
    axis?.some((component) => component !== 0) ? axis : null,
  );
}

/** The form wins over the selection: it is what the user is working on. */
export function jointPreviewOf(state: ViewerState): JointPreview | null {
  if (state.jointForm !== null) {
    return formPreview(
      state.openPantin?.document,
      state.jointForm,
      isDriven(state, state.jointForm.jointId),
    );
  }
  const nodeId = selectedNodeIdOf(state.selection);
  const ref = nodeId === null ? null : parseNodeId(nodeId);
  const joint =
    ref?.kind === "joint"
      ? state.openPantin?.document.joints.find((candidate) => candidate.id === ref.jointId)
      : undefined;
  return joint === undefined
    ? null
    : previewOf(
        state.openPantin?.document,
        { parentBodyId: joint.parent, childBodyId: joint.child, driven: isDriven(state, joint.id) },
        joint.origin,
        joint.axis,
      );
}
