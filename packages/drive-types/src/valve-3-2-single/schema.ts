import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import type { DriveParameter, DriveTag } from "../schema-common.ts";

// 3/2 valve with a spring return: coil 12 puts port 2 under pressure, without it port 2 exhausts (ADR 0028 point 4).
export const Valve32SingleFieldsSchema = z.object({ type: z.literal("valve_3_2_single") });

export const VALVE_3_2_SINGLE_PARAMETERS = [] as const satisfies readonly DriveParameter[];

export const VALVE_3_2_SINGLE_PORTS = [
  { name: "port_2", domain: "pneumatic" },
] as const satisfies readonly DrivePort[];

export const VALVE_3_2_SINGLE_TAGS = [
  { member: "coil_12", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
