import type { DriveTypeLabels } from "../schema-common.ts";
import type { DOUBLE_ACTING_CYLINDER_PARAMETERS, DOUBLE_ACTING_CYLINDER_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const DOUBLE_ACTING_CYLINDER_LABELS = {
  en: {
    name: "Double-acting cylinder",
    parameters: {
      speed: "Speed",
    },
    tags: {
      extend: "Extend coil",
      retract: "Retract coil",
    },
  },
  fr: {
    name: "Vérin double effet",
    parameters: {
      speed: "Vitesse",
    },
    tags: {
      extend: "Bobine de sortie",
      retract: "Bobine de rentrée",
    },
  },
} satisfies DriveTypeLabels<
  (typeof DOUBLE_ACTING_CYLINDER_PARAMETERS)[number]["field"],
  (typeof DOUBLE_ACTING_CYLINDER_TAGS)[number]["member"]
>;
