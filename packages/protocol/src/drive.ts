import { DriveFieldsSchema } from "@pantin/drive-types/schemas";
import { z } from "zod";
import { DisplayNameSchema, DriveIdSchema, KeySchema } from "./ids.ts";

// A drive (ADR 0022, 0028): the device the PLC commands (valve, contactor,
// variable speed drive, servo drive), through its own tags
// "<assembly>.<tagKey>.<member>". It moves no joint: its output ports feed
// actuators (actuator.ts). Its type's own fields come from
// @pantin/drive-types, one folder per type; the fields every drive shares are
// here.

const driveFields = {
  name: DisplayNameSchema,
  // Where its tags live: "<assembly>.<tagKey>.<member>" (ADR 0019).
  assembly: KeySchema,
};

// The core derives the id and the tag key from the name, as for joints.
export const CreateDriveRequestSchema = z.intersection(z.object(driveFields), DriveFieldsSchema);
export type CreateDriveRequest = z.infer<typeof CreateDriveRequestSchema>;

export const DriveSchema = z.intersection(
  z.object({ id: DriveIdSchema, tagKey: KeySchema, ...driveFields }),
  DriveFieldsSchema,
);
export type Drive = z.infer<typeof DriveSchema>;

export {
  DRIVE_PARAMETERS,
  DRIVE_PORTS,
  DRIVE_TAGS,
  type DriveDiagnostic,
  type DriveParameter,
  type DriveParameterKind,
  type DriveTag,
  type DriveType,
} from "@pantin/drive-types/schemas";
