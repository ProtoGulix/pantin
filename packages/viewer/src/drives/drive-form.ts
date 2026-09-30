import {
  type CreateDriveRequest,
  CreateDriveRequestSchema,
  DRIVE_PARAMETERS,
  type Drive,
  type DriveType,
  type PantinDocument,
} from "@pantin/protocol";
import { driveCoordinateUnit } from "../actuators/actuator-joints.ts";
import { parseNumber, schemaMessage } from "../joints/joint-form.ts";
import { coordinateFromDisplay, coordinateToDisplay, formatDisplayNumber } from "../units.ts";
import { parameterConversionUnit } from "./parameter-units.ts";

// The drive form of the drives panel (ADR 0022, 0028) as pure functions. A
// drive moves no joint: its parameters come from DRIVE_PARAMETERS, so no drive
// type is named here. They are typed in the display unit of their kind (see
// parameter-units.ts) and sent in SI.

export interface DriveFormState {
  // The drive this form changes, or null when it creates one.
  driveId: string | null;
  type: DriveType;
  name: string;
  assembly: string;
  // Raw text of each parameter, by field, unvalidated.
  values: Readonly<Record<string, string>>;
}

export const DRIVE_TYPES: readonly DriveType[] = Object.keys(DRIVE_PARAMETERS).filter(
  (type): type is DriveType => type in DRIVE_PARAMETERS,
);

export function initialDriveForm(document: PantinDocument): DriveFormState {
  return {
    driveId: null,
    type: DRIVE_TYPES[0] ?? "valve_5_3_closed",
    name: "",
    assembly: document.assemblies[0]?.key ?? "",
    values: {},
  };
}

export function driveFormFor(drive: Drive, document: PantinDocument): DriveFormState {
  const unit = driveCoordinateUnit(document, drive.id);
  const values: Record<string, string> = {};
  for (const parameter of DRIVE_PARAMETERS[drive.type]) {
    const stored: unknown = Reflect.get(drive, parameter.field);
    if (typeof stored === "number") {
      const shown = coordinateToDisplay(parameterConversionUnit(parameter.kind, unit), stored);
      values[parameter.field] = formatDisplayNumber(shown);
    }
  }
  const { id, name, assembly, type } = drive;
  return { driveId: id, type, name, assembly, values };
}

/** Another type has other parameters: they start empty. */
export function withDriveFormType(form: DriveFormState, type: DriveType): DriveFormState {
  return { ...form, type, values: {} };
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
  const unit = driveCoordinateUnit(document, form.driveId);
  const parameters = Object.fromEntries(
    DRIVE_PARAMETERS[form.type].map((parameter) => [
      parameter.field,
      coordinateFromDisplay(
        parameterConversionUnit(parameter.kind, unit),
        parseNumber(form.values[parameter.field]),
      ),
    ]),
  );
  const parsed = CreateDriveRequestSchema.safeParse({
    type: form.type,
    name: form.name,
    assembly: form.assembly,
    ...parameters,
  });
  return parsed.success
    ? { ok: true, request: parsed.data }
    : { ok: false, message: schemaMessage(parsed.error) };
}
