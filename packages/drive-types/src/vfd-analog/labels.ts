import type { DriveTypeLabels } from "../schema-common.ts";
import type { VFD_ANALOG_PARAMETERS, VFD_ANALOG_PORTS, VFD_ANALOG_TAGS } from "./schema.ts";

// What the user reads; the tag members and port names themselves stay in English (ADR 0022).
export const VFD_ANALOG_LABELS = {
  en: {
    name: "Variable speed drive, analog",
    parameters: {
      acceleration: "Acceleration",
    },
    tags: {
      speed_setpoint: "Speed setpoint",
      speed: "Actual speed",
    },
    ports: {
      out: "Output",
    },
  },
  fr: {
    name: "Variateur, consigne analogique",
    parameters: {
      acceleration: "Accélération",
    },
    tags: {
      speed_setpoint: "Consigne de vitesse",
      speed: "Vitesse réelle",
    },
    ports: {
      out: "Sortie",
    },
  },
} satisfies DriveTypeLabels<
  (typeof VFD_ANALOG_PARAMETERS)[number]["field"],
  (typeof VFD_ANALOG_TAGS)[number]["member"],
  (typeof VFD_ANALOG_PORTS)[number]["name"]
>;
