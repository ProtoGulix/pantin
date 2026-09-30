import { DriveFieldsSchema } from "@pantin/drive-types/schemas";
import { z } from "zod";
import { DisplayNameSchema, DriveIdSchema, JointIdSchema, KeySchema } from "./ids.ts";

// A drive (ADR 0022): an actuator that moves one or more joints, driven by
// its own command tags "<assembly>.<tagKey>.<member>". Its type's own fields
// come from @pantin/drive-types, one folder per type; the fields every drive
// shares are here.

const driveFields = {
  name: DisplayNameSchema,
  // Where its tags live: "<assembly>.<tagKey>.<member>" (ADR 0019).
  assembly: KeySchema,
  // The joints it moves, each at most once.
  joints: z
    .array(JointIdSchema)
    .min(1, "A drive moves at least one joint.")
    .refine((ids) => new Set(ids).size === ids.length, "A drive lists each joint once."),
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
  DRIVE_TAGS,
  type DriveParameter,
  type DriveTag,
  type DriveType,
} from "@pantin/drive-types/schemas";
