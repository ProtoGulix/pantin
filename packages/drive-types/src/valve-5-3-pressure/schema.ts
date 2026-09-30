import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import type { DriveParameter, DriveTag } from "../schema-common.ts";

// 5/3 valve, centre pressure: springs bring the spool to the centre without a coil.
export const Valve53PressureFieldsSchema = z.object({ type: z.literal("valve_5_3_pressure") });

export const VALVE_5_3_PRESSURE_PARAMETERS = [] as const satisfies readonly DriveParameter[];

export const VALVE_5_3_PRESSURE_PORTS = [
  { name: "port_2", domain: "pneumatic" },
  { name: "port_4", domain: "pneumatic" },
] as const satisfies readonly DrivePort[];

export const VALVE_5_3_PRESSURE_TAGS = [
  { member: "coil_14", type: "bit", direction: "command" },
  { member: "coil_12", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
