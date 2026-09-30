import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import type { DriveParameter, DriveTag } from "../schema-common.ts";

// Contactor: closed while "run" is set, open otherwise.
export const ContactorFieldsSchema = z.object({ type: z.literal("contactor") });

export const CONTACTOR_PARAMETERS = [] as const satisfies readonly DriveParameter[];

export const CONTACTOR_PORTS = [
  { name: "out", domain: "ac_power" },
] as const satisfies readonly DrivePort[];

export const CONTACTOR_TAGS = [
  { member: "run", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
