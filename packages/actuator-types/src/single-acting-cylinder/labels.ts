import type { ActuatorTypeLabels } from "../schema-common.ts";
import type {
  SINGLE_ACTING_CYLINDER_INPUT_PORTS,
  SINGLE_ACTING_CYLINDER_PARAMETERS,
} from "./schema.ts";

// What the user reads; the port names themselves stay in English (ADR 0028).
export const SINGLE_ACTING_CYLINDER_LABELS = {
  en: {
    name: "Single-acting cylinder",
    parameters: {
      extendSpeed: "Extend speed",
      returnSpeed: "Return speed",
    },
    ports: {
      cap: "Cap chamber (extends)",
    },
  },
  fr: {
    name: "Vérin simple effet",
    parameters: {
      extendSpeed: "Vitesse de sortie",
      returnSpeed: "Vitesse de rappel",
    },
    ports: {
      cap: "Chambre fond (sortie)",
    },
  },
} satisfies ActuatorTypeLabels<
  (typeof SINGLE_ACTING_CYLINDER_PARAMETERS)[number]["field"],
  (typeof SINGLE_ACTING_CYLINDER_INPUT_PORTS)[number]["name"]
>;
