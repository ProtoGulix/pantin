import type { DriveTypeLabels } from "../schema-common.ts";
import type { VALVE_5_3_CLOSED_PARAMETERS, VALVE_5_3_CLOSED_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const VALVE_5_3_CLOSED_LABELS = {
  en: {
    name: "Valve 5/3, closed centre",
    parameters: {},
    tags: {
      coil_14: "Coil 14",
      coil_12: "Coil 12",
    },
  },
  fr: {
    name: "Distributeur 5/3, centre fermé",
    parameters: {},
    tags: {
      coil_14: "Bobine 14",
      coil_12: "Bobine 12",
    },
  },
} satisfies DriveTypeLabels<
  (typeof VALVE_5_3_CLOSED_PARAMETERS)[number]["field"],
  (typeof VALVE_5_3_CLOSED_TAGS)[number]["member"]
>;
