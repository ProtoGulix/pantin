import { ActuatorFieldsSchema } from "@pantin/actuator-types/schemas";
import { z } from "zod";
import {
  ActuatorIdSchema,
  DisplayNameSchema,
  DriveIdSchema,
  JointIdSchema,
  KeySchema,
} from "./ids.ts";

// An actuator (ADR 0028): a cylinder or a motor. It has no tag: it reads the
// output ports of the drive that feeds it and moves joints. Its type's own
// fields come from @pantin/actuator-types, one folder per type; the fields
// every actuator shares are here.

// Which drive feeds the actuator, and through which ports: for each input
// port of the actuator's type, the output port of that drive it reads, e.g.
// { "drive": "valve", "ports": { "cap": "port_4", "rod": "port_2" } }.
export const ActuatorFeedSchema = z.object({
  drive: DriveIdSchema,
  ports: z.record(z.string().min(1), z.string().min(1)),
});
export type ActuatorFeed = z.infer<typeof ActuatorFeedSchema>;

const actuatorFields = {
  name: DisplayNameSchema,
  // Where the actuator belongs, for grouping in clients (ADR 0019).
  assembly: KeySchema,
  // Optional: an actuator without feed holds its joints where they are.
  feed: ActuatorFeedSchema.optional(),
  // The joints it moves, possibly none, each at most once.
  joints: z
    .array(JointIdSchema)
    .refine((ids) => new Set(ids).size === ids.length, "An actuator lists each joint once."),
};

// The core derives the id from the name, as for drives.
export const CreateActuatorRequestSchema = z.intersection(
  z.object(actuatorFields),
  ActuatorFieldsSchema,
);
export type CreateActuatorRequest = z.infer<typeof CreateActuatorRequestSchema>;

export const ActuatorSchema = z.intersection(
  z.object({ id: ActuatorIdSchema, ...actuatorFields }),
  ActuatorFieldsSchema,
);
export type Actuator = z.infer<typeof ActuatorSchema>;

export {
  ACTUATOR_DEFAULT_FEEDS,
  ACTUATOR_INPUT_PORTS,
  ACTUATOR_PARAMETERS,
  type ActuatorType,
} from "@pantin/actuator-types/schemas";
