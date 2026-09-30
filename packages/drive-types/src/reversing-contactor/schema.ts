import { z } from "zod";
import type { DrivePort } from "../ports.ts";
import type { DriveParameter, DriveTag } from "../schema-common.ts";

// Reversing contactor: "forward" or "reverse" closes its own contactor; an
// interlock keeps the first one closed while both are set.
export const ReversingContactorFieldsSchema = z.object({ type: z.literal("reversing_contactor") });

export const REVERSING_CONTACTOR_PARAMETERS = [] as const satisfies readonly DriveParameter[];

export const REVERSING_CONTACTOR_PORTS = [
  { name: "out", domain: "ac_power" },
] as const satisfies readonly DrivePort[];

export const REVERSING_CONTACTOR_TAGS = [
  { member: "forward", type: "bit", direction: "command" },
  { member: "reverse", type: "bit", direction: "command" },
] as const satisfies readonly DriveTag[];
