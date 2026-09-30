import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import type { DriveParameter, DriveTag } from "../schema-common.ts";

// 5/2 valve with a spring return to its pilot 12 position.
export const Valve52SingleFieldsSchema = z.object({ type: z.literal("valve_5_2_single") });

export const VALVE_5_2_SINGLE_PARAMETERS = [] as const satisfies readonly DriveParameter[];

export const VALVE_5_2_SINGLE_PORTS = [
  { name: "port_2", domain: "pneumatic" },
  { name: "port_4", domain: "pneumatic" },
] as const satisfies readonly DrivePort[];

export const VALVE_5_2_SINGLE_TAGS = [
  { member: "coil_14", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
