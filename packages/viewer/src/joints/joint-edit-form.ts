import {
  type CreateJointRequest,
  CreateJointRequestSchema,
  JOINT_COORDINATE_UNITS,
  JOINT_PARAMETERS,
  type Joint,
} from "@pantin/protocol";
import { coordinateToDisplay, formatDisplayNumber, metresToMillimetres } from "../units.ts";
import {
  buildJointRequest,
  FIELD_CHILD,
  FIELD_NAME,
  FIELD_PARENT,
  type JointFormState,
  type JointRequestResult,
  parameterInputs,
  schemaMessage,
  VECTOR_AXES,
  vectorFieldId,
} from "./joint-form.ts";
import { parameterValues } from "./joint-parameters.ts";
import { axisChoiceOf } from "./axis-choice.ts";

// The joint form prefilled with a stored joint, to change its type
// (ADR 0018). Fields show rounded display text; a field the user left as
// shown keeps the stored value, so opening and applying the form never moves
// a joint by a rounding error. No joint type is tested here (ADR 0016).

function parameterTexts(joint: Joint): Record<string, string> {
  const unit = JOINT_COORDINATE_UNITS[joint.type];
  const texts: Record<string, string> = {};
  for (const value of parameterValues(joint)) {
    if (value.kind === "coordinateRange") {
      texts[`${value.field}.lower`] = formatDisplayNumber(coordinateToDisplay(unit, value.lower));
      texts[`${value.field}.upper`] = formatDisplayNumber(coordinateToDisplay(unit, value.upper));
    } else {
      texts[`${value.field}.value`] = formatDisplayNumber(metresToMillimetres(value.metres));
    }
  }
  return texts;
}

export function jointFormFor(joint: Joint): JointFormState {
  const values: Record<string, string> = {
    [FIELD_NAME]: joint.name,
    [FIELD_PARENT]: joint.parent,
    [FIELD_CHILD]: joint.child,
    ...parameterTexts(joint),
  };
  for (const [index, axis] of VECTOR_AXES.entries()) {
    values[vectorFieldId("origin", axis)] = formatDisplayNumber(
      metresToMillimetres(joint.origin[index] ?? 0),
    );
    values[vectorFieldId("axis", axis)] = formatDisplayNumber(joint.axis[index] ?? 0);
  }
  return {
    jointId: joint.id,
    type: joint.type,
    values,
    customAxis: axisChoiceOf(joint.axis).direction === "custom",
  };
}

function untouched(form: JointFormState, shown: JointFormState, fieldIds: string[]): boolean {
  return fieldIds.every((id) => form.values[id] === shown.values[id]);
}

// The stored values of the fields left as shown: the origin and axis
// components, and the parameters when the type did not change.
function storedValuesKept(form: JointFormState, joint: Joint): Record<string, unknown> {
  const shown = jointFormFor(joint);
  const kept: Record<string, unknown> = {};
  for (const vector of ["origin", "axis"] as const) {
    const ids = VECTOR_AXES.map((axis) => vectorFieldId(vector, axis));
    if (untouched(form, shown, ids)) {
      kept[vector] = joint[vector];
    }
  }
  if (form.type === joint.type) {
    for (const parameter of JOINT_PARAMETERS[joint.type]) {
      const ids = parameterInputs(parameter).map((input) => input.id);
      if (untouched(form, shown, ids)) {
        kept[parameter.field] = Reflect.get(joint, parameter.field);
      }
    }
  }
  return kept;
}

/** The replacing request, validated by the protocol before anything is sent. */
export function buildJointEditRequest(form: JointFormState, joint: Joint): JointRequestResult {
  const built = buildJointRequest(form);
  if (!built.ok) {
    return built;
  }
  // Checked again: the kept values come from the stored joint, not the form.
  const parsed = CreateJointRequestSchema.safeParse({
    ...built.request,
    ...storedValuesKept(form, joint),
  });
  return parsed.success
    ? { ok: true, request: parsed.data }
    : { ok: false, message: schemaMessage(parsed.error) };
}

export type JointFormSubmission =
  | { kind: "create"; request: CreateJointRequest }
  | { kind: "update"; jointId: string; request: CreateJointRequest }
  // The schema's own message, in English.
  | { kind: "invalid"; message: string }
  // The joint the form was opened on was deleted meanwhile: never recreate it.
  | { kind: "gone" };

/** What submitting the form does, given the joints the Pantin has now. */
export function jointFormSubmission(
  form: JointFormState,
  joints: readonly Joint[],
): JointFormSubmission {
  if (form.jointId === null) {
    const built = buildJointRequest(form);
    return built.ok
      ? { kind: "create", request: built.request }
      : { kind: "invalid", message: built.message };
  }
  const edited = joints.find((joint) => joint.id === form.jointId);
  if (edited === undefined) {
    return { kind: "gone" };
  }
  const built = buildJointEditRequest(form, edited);
  return built.ok
    ? { kind: "update", jointId: edited.id, request: built.request }
    : { kind: "invalid", message: built.message };
}
