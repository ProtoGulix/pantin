import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import type { DriveParameter, DriveTag } from "../schema-common.ts";

// Two independent 3/2 valves in one body: coil 14 commands port 4, coil 12 port 2, each spring-returned to exhaust.
export const ValveDouble32FieldsSchema = z.object({ type: z.literal("valve_double_3_2") });

export const VALVE_DOUBLE_3_2_PARAMETERS = [] as const satisfies readonly DriveParameter[];

export const VALVE_DOUBLE_3_2_PORTS = [
  { name: "port_2", domain: "pneumatic" },
  { name: "port_4", domain: "pneumatic" },
] as const satisfies readonly DrivePort[];

export const VALVE_DOUBLE_3_2_TAGS = [
  { member: "coil_14", type: "bit", direction: "command" },
  { member: "coil_12", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
