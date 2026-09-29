import {
  type Body,
  type CreateJointRequest,
  CreateJointRequestSchema,
  JOINT_COORDINATE_UNITS,
  JOINT_PARAMETERS,
  type JointParameter,
  type JointType,
} from "@pantin/protocol";
import { coordinateFromDisplay, millimetresToMetres } from "../units.ts";
import { type AxisDirection, axisChoiceOf, axisVectorOf } from "./axis-choice.ts";
import { JOINT_TYPES } from "./joint-labels.ts";

// The state of the "New joint" form and the building of its request, as pure
// functions. The form is generated from JOINT_PARAMETERS: this module never
// tests a joint type (ADR 0016). The user types display units (mm, degrees);
// the request is built in SI and validated by the contract's schema.

export interface JointFormState {
  type: JointType;
  // Raw text of every input, by field id: what the user typed, unvalidated.
  values: Readonly<Record<string, string>>;
  // The user asked to type the axis components; otherwise X, Y or Z is
  // chosen and the components follow.
  customAxis: boolean;
}

type Vector = "origin" | "axis";
export const VECTOR_AXES = ["x", "y", "z"] as const;
type VectorAxis = (typeof VECTOR_AXES)[number];

export function vectorFieldId(vector: Vector, axis: VectorAxis): string {
  return `${vector}.${axis}`;
}

export type ParameterPart = "lower" | "upper" | "value";

export interface ParameterInput {
  id: string;
  part: ParameterPart;
}

/** The inputs a parameter needs, by kind: a range has two, a length one. */
export function parameterInputs(parameter: JointParameter): ParameterInput[] {
  if (parameter.kind === "coordinateRange") {
    return [
      { id: `${parameter.field}.lower`, part: "lower" },
      { id: `${parameter.field}.upper`, part: "upper" },
    ];
  }
  return [{ id: `${parameter.field}.value`, part: "value" }];
}

export const FIELD_NAME = "name";
export const FIELD_PARENT = "parent";
export const FIELD_CHILD = "child";

const SHARED_FIELD_IDS: readonly string[] = [
  FIELD_NAME,
  FIELD_PARENT,
  FIELD_CHILD,
  ...VECTOR_AXES.map((axis) => vectorFieldId("origin", axis)),
  ...VECTOR_AXES.map((axis) => vectorFieldId("axis", axis)),
];

// The default type is the first one the protocol lists.
const DEFAULT_TYPE: JointType = CreateJointRequestSchema.options[0].shape.type.value;

export function initialJointForm(bodies: readonly Body[]): JointFormState {
  const firstBody = bodies[0]?.id ?? "";
  return {
    type: DEFAULT_TYPE,
    values: {
      [FIELD_NAME]: "",
      [FIELD_PARENT]: firstBody,
      [FIELD_CHILD]: bodies[1]?.id ?? firstBody,
      ...Object.fromEntries(VECTOR_AXES.map((axis) => [vectorFieldId("origin", axis), "0"])),
      ...Object.fromEntries(VECTOR_AXES.map((axis) => [vectorFieldId("axis", axis), "0"])),
      [vectorFieldId("axis", "z")]: "1",
    },
    customAxis: false,
  };
}

export function withJointFormValue(
  form: JointFormState,
  fieldId: string,
  value: string,
): JointFormState {
  return { ...form, values: { ...form.values, [fieldId]: value } };
}

/** Another type has other parameters, possibly in another unit: they start empty. */
export function withJointFormType(form: JointFormState, type: JointType): JointFormState {
  const shared = Object.entries(form.values).filter(([id]) => SHARED_FIELD_IDS.includes(id));
  return { ...form, type, values: Object.fromEntries(shared) };
}

function axisTexts(form: JointFormState): string[] {
  return VECTOR_AXES.map((axis) => form.values[vectorFieldId("axis", axis)] ?? "");
}

function withAxisTexts(form: JointFormState, texts: readonly string[]): JointFormState {
  const values = { ...form.values };
  for (const [index, axis] of VECTOR_AXES.entries()) {
    values[vectorFieldId("axis", axis)] = texts[index] ?? "";
  }
  return { ...form, values };
}

/** The axis as chosen in the form; an unreadable component counts as custom. */
export function formAxisChoice(form: JointFormState) {
  const components = axisTexts(form).map(parseNumber);
  const choice = axisChoiceOf(
    components.map((component) => (Number.isFinite(component) ? component : 0)),
  );
  const readable = components.every(Number.isFinite);
  return form.customAxis || !readable ? { ...choice, direction: "custom" as const } : choice;
}

/** X, Y or Z keeps the current sense; "custom" only reveals the components. */
export function withJointAxisDirection(
  form: JointFormState,
  direction: AxisDirection | "custom",
): JointFormState {
  if (direction === "custom") {
    return { ...form, customAxis: true };
  }
  const vector = axisVectorOf(direction, formAxisChoice(form).reversed);
  return { ...withAxisTexts(form, vector.map(String)), customAxis: false };
}

/** Runs the axis the other way; a component that is not a number is left as typed. */
export function withJointAxisReversed(form: JointFormState): JointFormState {
  const texts = axisTexts(form).map((text) => {
    const component = parseNumber(text);
    return Number.isFinite(component) ? String(0 - component) : text;
  });
  return withAxisTexts(form, texts);
}

/** A raw select value as a joint type, or null: form values are external input. */
export function parseJointType(raw: string): JointType | null {
  return JOINT_TYPES.find((type) => type === raw) ?? null;
}

// French keyboards type a decimal comma; an empty field is not zero.
export function parseNumber(text: string | undefined): number {
  const trimmed = (text ?? "").trim().replace(",", ".");
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

function readVector(form: JointFormState, vector: Vector, convert: (n: number) => number) {
  return VECTOR_AXES.map((axis) => convert(parseNumber(form.values[vectorFieldId(vector, axis)])));
}

function parameterFields(form: JointFormState): Record<string, unknown> {
  const unit = JOINT_COORDINATE_UNITS[form.type];
  const fields: Record<string, unknown> = {};
  for (const parameter of JOINT_PARAMETERS[form.type]) {
    const [first, second] = parameterInputs(parameter).map((input) =>
      parseNumber(form.values[input.id]),
    );
    if (parameter.kind === "coordinateRange") {
      fields[parameter.field] = [
        coordinateFromDisplay(unit, first ?? Number.NaN),
        coordinateFromDisplay(unit, second ?? Number.NaN),
      ];
    } else {
      fields[parameter.field] = millimetresToMetres(first ?? Number.NaN);
    }
  }
  return fields;
}

/** The schema's own issues, one sentence each, prefixed by the field they concern. */
export function schemaMessage(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  return error.issues
    .map((issue) =>
      issue.path.length === 0
        ? issue.message
        : `${issue.path.map(String).join(".")}: ${issue.message}`,
    )
    .join(" ");
}

export type JointRequestResult =
  | { ok: true; request: CreateJointRequest }
  // The schema's own message, in English, shown as the detail of the error.
  | { ok: false; message: string };

/** The SI request for the form, validated by the protocol before anything is sent. */
export function buildJointRequest(form: JointFormState): JointRequestResult {
  const parsed = CreateJointRequestSchema.safeParse({
    type: form.type,
    name: form.values[FIELD_NAME] ?? "",
    parent: form.values[FIELD_PARENT] ?? "",
    child: form.values[FIELD_CHILD] ?? "",
    origin: readVector(form, "origin", millimetresToMetres),
    axis: readVector(form, "axis", (component) => component),
    ...parameterFields(form),
  });
  if (parsed.success) {
    return { ok: true, request: parsed.data };
  }
  return { ok: false, message: schemaMessage(parsed.error) };
}
