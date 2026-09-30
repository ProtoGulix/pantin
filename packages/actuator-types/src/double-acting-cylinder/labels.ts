import type { ActuatorTypeLabels } from "../schema-common.ts";
import type {
  DOUBLE_ACTING_CYLINDER_INPUT_PORTS,
  DOUBLE_ACTING_CYLINDER_PARAMETERS,
} from "./schema.ts";

// What the user reads; the port names themselves stay in English (ADR 0028).
export const DOUBLE_ACTING_CYLINDER_LABELS = {
  en: {
    name: "Double-acting cylinder",
    parameters: {
      extendSpeed: "Extend speed",
      retractSpeed: "Retract speed",
    },
    ports: {
      cap: "Cap chamber (extends)",
      rod: "Rod chamber (retracts)",
    },
  },
  fr: {
    name: "Vérin double effet",
    parameters: {
      extendSpeed: "Vitesse de sortie",
      retractSpeed: "Vitesse de rentrée",
    },
    ports: {
      cap: "Chambre fond (sortie)",
      rod: "Chambre tige (rentrée)",
    },
  },
} satisfies ActuatorTypeLabels<
  (typeof DOUBLE_ACTING_CYLINDER_PARAMETERS)[number]["field"],
  (typeof DOUBLE_ACTING_CYLINDER_INPUT_PORTS)[number]["name"]
>;
