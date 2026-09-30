import type { DriveTypeLabels } from "../schema-common.ts";
import type { CONTACTOR_PARAMETERS, CONTACTOR_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const CONTACTOR_LABELS = {
  en: {
    name: "Contactor",
    parameters: {},
    tags: {
      run: "Run",
    },
  },
  fr: {
    name: "Contacteur",
    parameters: {},
    tags: {
      run: "Marche",
    },
  },
} satisfies DriveTypeLabels<
  (typeof CONTACTOR_PARAMETERS)[number]["field"],
  (typeof CONTACTOR_TAGS)[number]["member"]
>;
