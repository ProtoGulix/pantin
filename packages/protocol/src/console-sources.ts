import { z } from "zod";
import {
  ActuatorIdSchema,
  BodyIdSchema,
  DriveIdSchema,
  JointIdSchema,
  PresenceSensorIdSchema,
  SensorIdSchema,
} from "./ids.ts";

// The sources of console entries (ADR 0031), and the narrower ones that each event code allows.

// The Pantin itself, or one of its elements by id.
export const ConsoleSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pantin") }),
  z.object({ kind: z.literal("drive"), id: DriveIdSchema }),
  z.object({ kind: z.literal("actuator"), id: ActuatorIdSchema }),
  z.object({ kind: z.literal("sensor"), id: SensorIdSchema }),
  z.object({ kind: z.literal("presence_sensor"), id: PresenceSensorIdSchema }),
  z.object({ kind: z.literal("joint"), id: JointIdSchema }),
  z.object({ kind: z.literal("body"), id: BodyIdSchema }),
]);
export type ConsoleSource = z.infer<typeof ConsoleSourceSchema>;

export const DriveSourceSchema = z.object({ kind: z.literal("drive"), id: DriveIdSchema });
export const JointOrDriveSourceSchema = z.discriminatedUnion("kind", [
  DriveSourceSchema,
  z.object({ kind: z.literal("joint"), id: JointIdSchema }),
]);
export const PantinSourceSchema = z.object({ kind: z.literal("pantin") });
export const SensorOrPresenceSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sensor"), id: SensorIdSchema }),
  z.object({ kind: z.literal("presence_sensor"), id: PresenceSensorIdSchema }),
]);
export const BodySourceSchema = z.object({ kind: z.literal("body"), id: BodyIdSchema });
