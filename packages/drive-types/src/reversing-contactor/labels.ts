import type { DriveTypeLabels } from "../schema-common.ts";
import type {
  REVERSING_CONTACTOR_PARAMETERS,
  REVERSING_CONTACTOR_PORTS,
  REVERSING_CONTACTOR_TAGS,
} from "./schema.ts";

// What the user reads; the tag members and port names themselves stay in English (ADR 0022).
export const REVERSING_CONTACTOR_LABELS = {
  en: {
    name: "Reversing contactor",
    parameters: {},
    tags: {
      forward: "Forward",
      reverse: "Reverse",
    },
    ports: {
      out: "Output",
    },
  },
  fr: {
    name: "Contacteur inverseur",
    parameters: {},
    tags: {
      forward: "Marche avant",
      reverse: "Marche arrière",
    },
    ports: {
      out: "Sortie",
    },
  },
} satisfies DriveTypeLabels<
  (typeof REVERSING_CONTACTOR_PARAMETERS)[number]["field"],
  (typeof REVERSING_CONTACTOR_TAGS)[number]["member"],
  (typeof REVERSING_CONTACTOR_PORTS)[number]["name"]
>;
