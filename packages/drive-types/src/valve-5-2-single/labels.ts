import type { DriveTypeLabels } from "../schema-common.ts";
import type { VALVE_5_2_SINGLE_PARAMETERS, VALVE_5_2_SINGLE_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const VALVE_5_2_SINGLE_LABELS = {
  en: {
    name: "Valve 5/2, single solenoid",
    parameters: {},
    tags: {
      coil_14: "Coil 14",
    },
  },
  fr: {
    name: "Distributeur 5/2, monostable",
    parameters: {},
    tags: {
      coil_14: "Bobine 14",
    },
  },
} satisfies DriveTypeLabels<
  (typeof VALVE_5_2_SINGLE_PARAMETERS)[number]["field"],
  (typeof VALVE_5_2_SINGLE_TAGS)[number]["member"]
>;
