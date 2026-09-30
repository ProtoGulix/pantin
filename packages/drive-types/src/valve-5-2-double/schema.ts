import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import type { DriveParameter, DriveTag } from "../schema-common.ts";

// 5/2 double solenoid valve with memory: the spool stays where the last single coil put it.
export const Valve52DoubleFieldsSchema = z.object({ type: z.literal("valve_5_2_double") });

export const VALVE_5_2_DOUBLE_PARAMETERS = [] as const satisfies readonly DriveParameter[];

export const VALVE_5_2_DOUBLE_PORTS = [
  { name: "port_2", domain: "pneumatic" },
  { name: "port_4", domain: "pneumatic" },
] as const satisfies readonly DrivePort[];

export const VALVE_5_2_DOUBLE_TAGS = [
  { member: "coil_14", type: "bit", direction: "command" },
  { member: "coil_12", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
