import {
  JOINT_COORDINATE_UNITS,
  JOINT_PARAMETERS,
  type Joint,
  UpdateJointRequestSchema,
} from "@pantin/protocol";
import { coordinateFromDisplay, millimetresToMetres } from "../units.ts";
import { axisChoiceOf, axisVectorOf, parseAxisDirection, reversedAxis } from "./axis-choice.ts";
import {
  FIELD_CHILD,
  FIELD_NAME,
  FIELD_PARENT,
  type JointRequestResult,
  parameterInputs,
  parseNumber,
  schemaMessage,
  VECTOR_AXES,
  vectorFieldId,
} from "./joint-form.ts";
import { parameterValues } from "./joint-parameters.ts";

// The update request of an inline edit in the properties grid: the joint as
// the core stores it (SI), with the one edited field replaced by the typed
// value converted from display units. Untouched fields are copied, never
// round-tripped through their displayed (rounded) text. No joint type is
// tested here: parameters come from JOINT_PARAMETERS (ADR 0016).

type Replacement = Record<string, unknown>;

function vectorReplacement(joint: Joint, fieldId: string, text: string): Replacement | null {
  for (const vector of ["origin", "axis"] as const) {
    for (const [index, axis] of VECTOR_AXES.entries()) {
      if (vectorFieldId(vector, axis) === fieldId) {
        const typed = parseNumber(text);
        const value = vector === "origin" ? millimetresToMetres(typed) : typed;
        return { [vector]: joint[vector].map((old, at) => (at === index ? value : old)) };
      }
    }
  }
  return null;
}

// Field ids of the properties grid's direction and sense selects.
export const FIELD_AXIS_DIRECTION = "axis.direction";
export const FIELD_AXIS_SENSE = "axis.sense";
export const AXIS_SENSES = ["positive", "reversed"] as const;

function axisChoiceReplacement(joint: Joint, fieldId: string, text: string): Replacement | null {
  const current = axisChoiceOf(joint.axis);
  if (fieldId === FIELD_AXIS_DIRECTION) {
    const direction = parseAxisDirection(text);
    return direction === null ? null : { axis: axisVectorOf(direction, current.reversed) };
  }
  if (fieldId === FIELD_AXIS_SENSE && AXIS_SENSES.some((sense) => sense === text)) {
    const reversed = text === "reversed";
    return { axis: reversed === current.reversed ? joint.axis : reversedAxis(joint.axis) };
  }
  return null;
}

function parameterReplacement(joint: Joint, fieldId: string, text: string): Replacement | null {
  const unit = JOINT_COORDINATE_UNITS[joint.type];
  const typed = parseNumber(text);
  for (const parameter of JOINT_PARAMETERS[joint.type]) {
    for (const input of parameterInputs(parameter)) {
      if (input.id !== fieldId) {
        continue;
      }
      if (parameter.kind === "length") {
        return { [parameter.field]: millimetresToMetres(typed) };
      }
      const range = parameterValues(joint).find((value) => value.field === parameter.field);
      if (range?.kind !== "coordinateRange") {
        return null;
      }
      const value = coordinateFromDisplay(unit, typed);
      return {
        [parameter.field]: input.part === "lower" ? [value, range.upper] : [range.lower, value],
      };
    }
  }
  return null;
}

function replacementFor(joint: Joint, fieldId: string, text: string): Replacement | null {
  if (fieldId === FIELD_NAME || fieldId === FIELD_PARENT || fieldId === FIELD_CHILD) {
    return { [fieldId]: text };
  }
  return (
    vectorReplacement(joint, fieldId, text) ??
    axisChoiceReplacement(joint, fieldId, text) ??
    parameterReplacement(joint, fieldId, text)
  );
}

/** The validated SI request replacing `fieldId` of `joint` by the typed text. */
export function buildJointUpdate(joint: Joint, fieldId: string, text: string): JointRequestResult {
  const replacement = replacementFor(joint, fieldId, text);
  if (replacement === null) {
    return { ok: false, message: `Unknown joint field: ${fieldId}.` };
  }
  const { id: _id, ...stored } = joint;
  const parsed = UpdateJointRequestSchema.safeParse({ ...stored, ...replacement });
  return parsed.success
    ? { ok: true, request: parsed.data }
    : { ok: false, message: schemaMessage(parsed.error) };
}
