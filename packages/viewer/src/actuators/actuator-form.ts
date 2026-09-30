import {
  ACTUATOR_PARAMETERS,
  type Actuator,
  type ActuatorType,
  type CreateActuatorRequest,
  CreateActuatorRequestSchema,
  JOINT_COORDINATE_UNITS,
  type PantinDocument,
} from "@pantin/protocol";
import { parameterConversionUnit } from "../drives/parameter-units.ts";
import { parseNumber, schemaMessage } from "../joints/joint-form.ts";
import { coordinateFromDisplay, coordinateToDisplay, formatDisplayNumber } from "../units.ts";
import { defaultFeedPorts, drivesFeeding, withPortSwapped } from "./actuator-feed.ts";
import { actuatorOfJoint, jointsCoordinateUnit, movableJoints } from "./actuator-joints.ts";

// The actuator form of the drives panel (ADR 0028 point 13) as pure
// functions. The type comes first, then the drive that feeds it (only those
// whose ports fit), then the joints it moves. Parameters come from
// ACTUATOR_PARAMETERS and are typed in the display unit of the joints.

export interface ActuatorFormState {
  // The actuator this form changes, or null when it creates one.
  actuatorId: string | null;
  type: ActuatorType;
  name: string;
  assembly: string;
  // The feeding drive, or null: an actuator without feed holds its joints.
  driveId: string | null;
  // For each input port of the type, the output port of that drive it reads.
  ports: Readonly<Record<string, string>>;
  joints: readonly string[];
  // Raw text of each parameter, by field, unvalidated.
  values: Readonly<Record<string, string>>;
}

export const ACTUATOR_TYPES: readonly ActuatorType[] = Object.keys(ACTUATOR_PARAMETERS).filter(
  (type): type is ActuatorType => type in ACTUATOR_PARAMETERS,
);

// The first drive that fits, with its default feed, unless the wanted drive
// fits: changing the type keeps the drive when it still can feed it.
function withFeed(
  form: ActuatorFormState,
  document: PantinDocument,
  wantedDriveId: string | null,
): ActuatorFormState {
  const fitting = drivesFeeding(document, form.type);
  const drive = fitting.find((candidate) => candidate.id === wantedDriveId) ?? fitting[0];
  const ports = drive === undefined ? null : defaultFeedPorts(form.type, drive.type);
  return { ...form, driveId: drive?.id ?? null, ports: ports ?? {} };
}

export function initialActuatorForm(document: PantinDocument): ActuatorFormState {
  const form: ActuatorFormState = {
    actuatorId: null,
    type: ACTUATOR_TYPES[0] ?? "double_acting_cylinder",
    name: "",
    assembly: document.assemblies[0]?.key ?? "",
    driveId: null,
    ports: {},
    joints: [],
    values: {},
  };
  return withFeed(form, document, null);
}

export function actuatorFormFor(actuator: Actuator, document: PantinDocument): ActuatorFormState {
  const unit = jointsCoordinateUnit(document, actuator.joints);
  const values: Record<string, string> = {};
  for (const parameter of ACTUATOR_PARAMETERS[actuator.type]) {
    const stored: unknown = Reflect.get(actuator, parameter.field);
    if (typeof stored === "number") {
      const shown = coordinateToDisplay(parameterConversionUnit(parameter.kind, unit), stored);
      values[parameter.field] = formatDisplayNumber(shown);
    }
  }
  const { id, name, assembly, type, joints, feed } = actuator;
  return {
    actuatorId: id,
    type,
    name,
    assembly,
    driveId: feed?.drive ?? null,
    ports: feed?.ports ?? {},
    joints,
    values,
  };
}

/** Another type has other parameters and ports: they start empty or default. */
export function withActuatorFormType(
  form: ActuatorFormState,
  type: ActuatorType,
  document: PantinDocument,
): ActuatorFormState {
  return withFeed({ ...form, type, values: {} }, document, form.driveId);
}

/** A new drive brings its default feed; null removes the feed. */
export function withActuatorFormDrive(
  form: ActuatorFormState,
  driveId: string | null,
  document: PantinDocument,
): ActuatorFormState {
  const drive = document.drives.find((candidate) => candidate.id === driveId);
  const ports = drive === undefined ? null : defaultFeedPorts(form.type, drive.type);
  return { ...form, driveId: ports === null ? null : driveId, ports: ports ?? {} };
}

/** See withPortSwapped: the form's port wiring is swapped, never duplicated. */
export function withActuatorFormPort(
  form: ActuatorFormState,
  inputPort: string,
  outputPort: string,
): ActuatorFormState {
  return { ...form, ports: withPortSwapped(form.ports, inputPort, outputPort) };
}

export function withActuatorFormJoint(
  form: ActuatorFormState,
  jointId: string,
  connected: boolean,
): ActuatorFormState {
  const others = form.joints.filter((id) => id !== jointId);
  return { ...form, joints: connected ? [...others, jointId] : others };
}

export function withActuatorFormValue(
  form: ActuatorFormState,
  field: string,
  text: string,
): ActuatorFormState {
  return { ...form, values: { ...form.values, [field]: text } };
}

/**
 * The joints the form offers: movable, not moved by another actuator, and of
 * the unit of those already chosen (an actuator's joints share their unit).
 */
export function selectableJoints(document: PantinDocument, form: ActuatorFormState) {
  const chosen = document.joints.find((joint) => form.joints.includes(joint.id));
  const unit = chosen === undefined ? null : JOINT_COORDINATE_UNITS[chosen.type];
  return movableJoints(document).filter((joint) => {
    const mover = actuatorOfJoint(document, joint.id);
    const free = mover === undefined || mover.id === form.actuatorId;
    return free && (unit === null || JOINT_COORDINATE_UNITS[joint.type] === unit);
  });
}

export type ActuatorRequestResult =
  | { ok: true; request: CreateActuatorRequest }
  // The schema's own message, in English.
  | { ok: false; message: string };

/** The SI request, validated by the protocol before anything is sent. */
export function buildActuatorRequest(
  form: ActuatorFormState,
  document: PantinDocument,
): ActuatorRequestResult {
  const unit = jointsCoordinateUnit(document, form.joints);
  const parameters = Object.fromEntries(
    ACTUATOR_PARAMETERS[form.type].map((parameter) => [
      parameter.field,
      coordinateFromDisplay(
        parameterConversionUnit(parameter.kind, unit),
        parseNumber(form.values[parameter.field]),
      ),
    ]),
  );
  const feed = form.driveId === null ? {} : { feed: { drive: form.driveId, ports: form.ports } };
  const parsed = CreateActuatorRequestSchema.safeParse({
    type: form.type,
    name: form.name,
    assembly: form.assembly,
    joints: form.joints,
    ...feed,
    ...parameters,
  });
  return parsed.success
    ? { ok: true, request: parsed.data }
    : { ok: false, message: schemaMessage(parsed.error) };
}

/**
 * The form a joint's context menu opens: its actuator if it has one,
 * otherwise a new actuator already moving it, named after it, in the assembly
 * of its child body. Null for a joint no actuator can move.
 */
export function actuatorFormForJoint(
  document: PantinDocument,
  jointId: string,
): ActuatorFormState | null {
  const joint = movableJoints(document).find((candidate) => candidate.id === jointId);
  if (joint === undefined) {
    return null;
  }
  const actuator = actuatorOfJoint(document, jointId);
  if (actuator !== undefined) {
    return actuatorFormFor(actuator, document);
  }
  const assembly = document.bodies.find((body) => body.id === joint.child)?.assembly;
  const initial = initialActuatorForm(document);
  return {
    ...initial,
    name: joint.name,
    assembly: assembly ?? initial.assembly,
    joints: [jointId],
  };
}
