import {
  type CreateSensorRequest,
  CreateSensorRequestSchema,
  JOINT_COORDINATE_UNITS,
  type JointCoordinateUnit,
  type PantinDocument,
  SENSOR_PARAMETERS,
  type Sensor,
  type SensorParameter,
  type SensorType,
} from "@pantin/protocol";
import { movableJoints } from "../drives/drive-form.ts";
import { parseNumber, schemaMessage } from "../joints/joint-form.ts";
import { coordinateFromDisplay, coordinateToDisplay, formatDisplayNumber } from "../units.ts";

// The sensor form of the right-hand panel (ADR 0023) as pure functions. Its
// parameters come from SENSOR_PARAMETERS, so no sensor type is named here;
// they are typed in the display unit of the watched joint (mm or degrees)
// and sent in SI. Each parameter kind has its inputs, by key: a range has
// "<field>.lower" and "<field>.upper", the others "<field>".

export interface SensorFormState {
  // The sensor this form changes, or null when it creates one.
  sensorId: string | null;
  type: SensorType;
  name: string;
  assembly: string;
  joint: string;
  // Raw text of each input, by key, unvalidated; a flag is "true" or "false".
  values: Readonly<Record<string, string>>;
}

export const SENSOR_TYPES: readonly SensorType[] = Object.keys(SENSOR_PARAMETERS).filter(
  (type): type is SensorType => type in SENSOR_PARAMETERS,
);

export function parseSensorType(raw: string): SensorType | null {
  return SENSOR_TYPES.find((type) => type === raw) ?? null;
}

/** The unit of the watched joint's coordinate; metres until a joint is chosen. */
export function sensorCoordinateUnit(
  document: PantinDocument,
  jointId: string,
): JointCoordinateUnit {
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  return joint === undefined ? "metre" : JOINT_COORDINATE_UNITS[joint.type];
}

/** The input keys of one parameter, in the order the form shows them. */
export function parameterKeys(parameter: SensorParameter): string[] {
  return parameter.kind === "coordinateRange"
    ? [`${parameter.field}.lower`, `${parameter.field}.upper`]
    : [parameter.field];
}

// Pulses per metre or radian from pulses per mm or degree, and back: the
// inverse of a coordinate conversion.
const perUnitFromDisplay = (unit: JointCoordinateUnit, value: number) =>
  value / coordinateFromDisplay(unit, 1);
const perUnitToDisplay = (unit: JointCoordinateUnit, value: number) =>
  value * coordinateFromDisplay(unit, 1);

function displayTexts(parameter: SensorParameter, stored: unknown, unit: JointCoordinateUnit) {
  const format = (value: number) => formatDisplayNumber(coordinateToDisplay(unit, value));
  if (parameter.kind === "flag") {
    return [String(stored === true)];
  }
  if (parameter.kind === "pulsesPerUnit") {
    return typeof stored === "number" ? [formatDisplayNumber(perUnitToDisplay(unit, stored))] : [];
  }
  return Array.isArray(stored) ? stored.map((value) => format(Number(value))) : [];
}

function parameterValue(
  parameter: SensorParameter,
  values: Readonly<Record<string, string>>,
  unit: JointCoordinateUnit,
): unknown {
  const [first = "", second = ""] = parameterKeys(parameter).map((key) => values[key] ?? "");
  switch (parameter.kind) {
    case "flag":
      return first === "true";
    case "pulsesPerUnit":
      return perUnitFromDisplay(unit, parseNumber(first));
    case "coordinateRange":
      return [first, second].map((text) => coordinateFromDisplay(unit, parseNumber(text)));
  }
}

function formValues(type: SensorType, fields: object, unit: JointCoordinateUnit) {
  const values: Record<string, string> = {};
  for (const parameter of SENSOR_PARAMETERS[type]) {
    const texts = displayTexts(parameter, Reflect.get(fields, parameter.field), unit);
    for (const [index, key] of parameterKeys(parameter).entries()) {
      values[key] = texts[index] ?? "";
    }
  }
  return values;
}

// A new form starts with every flag unset, so that the checkbox shows the value sent.
function emptyValues(type: SensorType): Record<string, string> {
  return Object.fromEntries(
    SENSOR_PARAMETERS[type]
      .filter((parameter) => parameter.kind === "flag")
      .map((parameter) => [parameter.field, "false"]),
  );
}

export function initialSensorForm(document: PantinDocument): SensorFormState {
  const type = SENSOR_TYPES[0] ?? "position_switch";
  return {
    sensorId: null,
    type,
    name: "",
    assembly: document.assemblies[0]?.key ?? "",
    joint: movableJoints(document)[0]?.id ?? "",
    values: emptyValues(type),
  };
}

export function sensorFormFor(sensor: Sensor, document: PantinDocument): SensorFormState {
  const unit = sensorCoordinateUnit(document, sensor.joint);
  const { id, name, assembly, joint, type } = sensor;
  return { sensorId: id, type, name, assembly, joint, values: formValues(type, sensor, unit) };
}

/** Another type has other parameters: they start empty. */
export function withSensorFormType(form: SensorFormState, type: SensorType): SensorFormState {
  return { ...form, type, values: emptyValues(type) };
}

/** A joint in another unit (mm or degrees) empties the parameters: "98" would change meaning. */
export function withSensorFormJoint(
  form: SensorFormState,
  joint: string,
  document: PantinDocument,
): SensorFormState {
  const sameUnit =
    sensorCoordinateUnit(document, joint) === sensorCoordinateUnit(document, form.joint);
  return { ...form, joint, values: sameUnit ? form.values : emptyValues(form.type) };
}

export function withSensorFormValue(
  form: SensorFormState,
  key: string,
  text: string,
): SensorFormState {
  return { ...form, values: { ...form.values, [key]: text } };
}

export type SensorRequestResult =
  | { ok: true; request: CreateSensorRequest }
  // The schema's own message, in English.
  | { ok: false; message: string };

/** The SI request, validated by the protocol before anything is sent. */
export function buildSensorRequest(
  form: SensorFormState,
  document: PantinDocument,
): SensorRequestResult {
  const unit = sensorCoordinateUnit(document, form.joint);
  const parameters = Object.fromEntries(
    SENSOR_PARAMETERS[form.type].map((parameter) => [
      parameter.field,
      parameterValue(parameter, form.values, unit),
    ]),
  );
  const parsed = CreateSensorRequestSchema.safeParse({
    type: form.type,
    name: form.name,
    assembly: form.assembly,
    joint: form.joint,
    ...parameters,
  });
  return parsed.success
    ? { ok: true, request: parsed.data }
    : { ok: false, message: schemaMessage(parsed.error) };
}
