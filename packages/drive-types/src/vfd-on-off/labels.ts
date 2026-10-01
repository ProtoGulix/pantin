import type { DriveTypeLabels } from "../schema-common.ts";
import type { VFD_ON_OFF_PARAMETERS, VFD_ON_OFF_PORTS, VFD_ON_OFF_TAGS } from "./schema.ts";

// What the user reads; the tag members and port names themselves stay in English (ADR 0022).
export const VFD_ON_OFF_LABELS = {
  en: {
    name: "Variable speed drive, on/off",
    parameters: {
      acceleration: "Acceleration",
    },
    tags: {
      run: "Run",
      reverse: "Reverse",
      speed: "Actual speed",
    },
    ports: {
      out: "Output",
    },
  },
  fr: {
    name: "Variateur, marche/arrêt",
    parameters: {
      acceleration: "Accélération",
    },
    tags: {
      run: "Marche",
      reverse: "Sens inverse",
      speed: "Vitesse réelle",
    },
    ports: {
      out: "Sortie",
    },
  },
} satisfies DriveTypeLabels<
  (typeof VFD_ON_OFF_PARAMETERS)[number]["field"],
  (typeof VFD_ON_OFF_TAGS)[number]["member"],
  (typeof VFD_ON_OFF_PORTS)[number]["name"]
>;
