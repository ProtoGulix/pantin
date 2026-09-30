import {
  type CreateDriveRequest,
  CreateDriveRequestSchema,
  DRIVE_PARAMETERS,
  type Drive,
  type DriveType,
  JOINT_COORDINATE_UNITS,
  type JointCoordinateUnit,
  type PantinDocument,
} from "@pantin/protocol";
import { parseNumber, schemaMessage } from "../joints/joint-form.ts";
import { coordinateFromDisplay, coordinateToDisplay, formatDisplayNumber } from "../units.ts";

// The drive form of the drives panel (ADR 0022) as pure functions. Its
// parameters come from DRIVE_PARAMETERS, so no drive type is named here; they
// are typed in the display unit of the connected joints (mm or degrees, per
// second or per second squared) and sent in SI.

export interface DriveFormState {
  // The drive this form changes, or null when it creates one.
  driveId: string | null;
  type: DriveType;
  name: string;
  assembly: string;
  joints: readonly string[];
  // Raw text of each parameter, by field, unvalidated.
  values: Readonly<Record<string, string>>;
}

export const DRIVE_TYPES: readonly DriveType[] = Object.keys(DRIVE_PARAMETERS).filter(
  (type): type is DriveType => type in DRIVE_PARAMETERS,
);

/** The joints a drive can move: those whose type has a coordinate. */
export function movableJoints(document: PantinDocument) {
  return document.joints.filter((joint) => JOINT_COORDINATE_UNITS[joint.type] !== null);
}

/** The drive that moves a joint, if any: a joint has one drive at most. */
export function driveOfJoint(document: PantinDocument, jointId: string): Drive | undefined {
  return document.drives.find((drive) => drive.joints.includes(jointId));
}

/** The unit of the connected joints; metres until a joint is chosen. */
export function driveCoordinateUnit(
  document: PantinDocument,
  jointIds: readonly string[],
): JointCoordinateUnit {
  const joint = document.joints.find((candidate) => jointIds.includes(candidate.id));
  return joint === undefined ? "metre" : JOINT_COORDINATE_UNITS[joint.type];
}

export function initialDriveForm(document: PantinDocument): DriveFormState {
  return {
    driveId: null,
    type: DRIVE_TYPES[0] ?? "double_acting_cylinder",
    name: "",
    assembly: document.assemblies[0]?.key ?? "",
    joints: [],
    values: {},
  };
}

export function driveFormFor(drive: Drive, document: PantinDocument): DriveFormState {
  const unit = driveCoordinateUnit(document, drive.joints);
  const values: Record<string, string> = {};
  for (const parameter of DRIVE_PARAMETERS[drive.type]) {
    const stored: unknown = Reflect.get(drive, parameter.field);
    if (typeof stored === "number") {
      values[parameter.field] = formatDisplayNumber(coordinateToDisplay(unit, stored));
    }
  }
  const { id, name, assembly, joints, type } = drive;
  return { driveId: id, type, name, assembly, joints, values };
}

/** Another type has other parameters: they start empty. */
export function withDriveFormType(form: DriveFormState, type: DriveType): DriveFormState {
  return { ...form, type, values: {} };
}

export function withDriveFormJoint(
  form: DriveFormState,
  jointId: string,
  connected: boolean,
): DriveFormState {
  const others = form.joints.filter((id) => id !== jointId);
  return { ...form, joints: connected ? [...others, jointId] : others };
}

export function withDriveFormValue(
  form: DriveFormState,
  field: string,
  text: string,
): DriveFormState {
  return { ...form, values: { ...form.values, [field]: text } };
}

export type DriveRequestResult =
  | { ok: true; request: CreateDriveRequest }
  // The schema's own message, in English.
  | { ok: false; message: string };

/** The SI request, validated by the protocol before anything is sent. */
export function buildDriveRequest(
  form: DriveFormState,
  document: PantinDocument,
): DriveRequestResult {
  const unit = driveCoordinateUnit(document, form.joints);
  const parameters = Object.fromEntries(
    DRIVE_PARAMETERS[form.type].map((parameter) => [
      parameter.field,
      coordinateFromDisplay(unit, parseNumber(form.values[parameter.field])),
    ]),
  );
  const parsed = CreateDriveRequestSchema.safeParse({
    type: form.type,
    name: form.name,
    assembly: form.assembly,
    joints: form.joints,
    ...parameters,
  });
  return parsed.success
    ? { ok: true, request: parsed.data }
    : { ok: false, message: schemaMessage(parsed.error) };
}

/**
 * The form a joint's context menu opens (ADR 0022): its drive if it has one,
 * otherwise a new drive already connected to it, named after it, with its
 * tags in the assembly of its child body. Null for a joint no drive can move.
 */
export function driveFormForJoint(
  document: PantinDocument,
  jointId: string,
): DriveFormState | null {
  const joint = movableJoints(document).find((candidate) => candidate.id === jointId);
  if (joint === undefined) {
    return null;
  }
  const drive = driveOfJoint(document, jointId);
  if (drive !== undefined) {
    return driveFormFor(drive, document);
  }
  const assembly = document.bodies.find((body) => body.id === joint.child)?.assembly;
  const initial = initialDriveForm(document);
  return {
    ...initial,
    name: joint.name,
    assembly: assembly ?? initial.assembly,
    joints: [jointId],
  };
}
