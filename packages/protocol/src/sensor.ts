import { SensorFieldsSchema } from "@pantin/sensor-types/schemas";
import { z } from "zod";
import { DisplayNameSchema, JointIdSchema, KeySchema, SensorIdSchema } from "./ids.ts";

// A joint sensor (ADR 0023): it watches one joint and reports on its own
// feedback tags "<assembly>.<tagKey>.<member>". Its type's own fields come
// from @pantin/sensor-types, one folder per type; the fields every sensor
// shares are here.

const sensorFields = {
  name: DisplayNameSchema,
  // Where its tags live: "<assembly>.<tagKey>.<member>" (ADR 0019).
  assembly: KeySchema,
  joint: JointIdSchema,
};

// The core derives the id and the tag key from the name, as for drives.
export const CreateSensorRequestSchema = z.intersection(z.object(sensorFields), SensorFieldsSchema);
export type CreateSensorRequest = z.infer<typeof CreateSensorRequestSchema>;

export const SensorSchema = z.intersection(
  z.object({ id: SensorIdSchema, tagKey: KeySchema, ...sensorFields }),
  SensorFieldsSchema,
);
export type Sensor = z.infer<typeof SensorSchema>;

export {
  SENSOR_PARAMETERS,
  SENSOR_TAGS,
  type SensorParameter,
  type SensorParameterKind,
  type SensorTag,
  type SensorType,
} from "@pantin/sensor-types/schemas";
