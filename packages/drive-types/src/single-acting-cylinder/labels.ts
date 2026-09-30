import type { DriveTypeLabels } from "../schema-common.ts";
import type { SINGLE_ACTING_CYLINDER_PARAMETERS, SINGLE_ACTING_CYLINDER_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const SINGLE_ACTING_CYLINDER_LABELS = {
  en: {
    name: "Single-acting cylinder",
    parameters: {
      speed: "Speed",
    },
    tags: {
      extend: "Extend coil",
    },
  },
  fr: {
    name: "Vérin simple effet",
    parameters: {
      speed: "Vitesse",
    },
    tags: {
      extend: "Bobine de sortie",
    },
  },
} satisfies DriveTypeLabels<
  (typeof SINGLE_ACTING_CYLINDER_PARAMETERS)[number]["field"],
  (typeof SINGLE_ACTING_CYLINDER_TAGS)[number]["member"]
>;
