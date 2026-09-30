import {
  type CreateSensorRequest,
  CreateSensorRequestSchema,
  JOINT_COORDINATE_UNITS,
  type JointCoordinateUnit,
  type PantinDocument,
  SENSOR_PARAMETERS,
  type Sensor,
  type SensorType,
} from "@pantin/protocol";
import { SensorFieldsSchema } from "@pantin/sensor-types/schemas";
import { movableJoints } from "../actuators/actuator-joints.ts";
import { schemaMessage } from "../joints/joint-form.ts";
import { defaultTexts, parameterKeys, parameterTexts, parameterValue } from "./parameter-texts.ts";

// The sensor form of the right-hand panel (ADR 0023) as pure functions. Its
// parameters come from SENSOR_PARAMETERS, so no sensor type is named here;
// they are typed in the display unit of the watched joint (mm or degrees)
// and sent in SI; parameter-texts.ts converts each kind of parameter.

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

function formValues(type: SensorType, fields: object, unit: JointCoordinateUnit) {
  const values: Record<string, string> = {};
  for (const parameter of SENSOR_PARAMETERS[type]) {
    const texts = parameterTexts(parameter, Reflect.get(fields, parameter.field), unit);
    for (const [index, key] of parameterKeys(parameter).entries()) {
      values[key] = texts[index] ?? "";
    }
  }
  return values;
}

function emptyValues(type: SensorType): Record<string, string> {
  return Object.assign({}, ...SENSOR_PARAMETERS[type].map(defaultTexts));
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

function siParameters(form: SensorFormState, unit: JointCoordinateUnit) {
  return Object.fromEntries(
    SENSOR_PARAMETERS[form.type].map((parameter) => [
      parameter.field,
      parameterValue(parameter, form.values, unit),
    ]),
  );
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
  const parameters = siParameters(form, unit);
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

/** The typed parameters as the type's fields, for the diagram; null while one does not parse. */
export function sensorFieldsOf(form: SensorFormState, unit: JointCoordinateUnit) {
  const parameters = siParameters(form, unit);
  const parsed = SensorFieldsSchema.safeParse({ type: form.type, ...parameters });
  return parsed.success ? parsed.data : null;
}
