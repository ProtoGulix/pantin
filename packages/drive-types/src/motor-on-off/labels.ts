import type { DriveTypeLabels } from "../schema-common.ts";
import type { MOTOR_ON_OFF_PARAMETERS, MOTOR_ON_OFF_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const MOTOR_ON_OFF_LABELS = {
  en: {
    name: "Motor, on/off",
    parameters: {
      nominalSpeed: "Nominal speed",
      acceleration: "Acceleration",
    },
    tags: {
      run: "Run",
      reverse: "Reverse",
      speed: "Actual speed",
    },
  },
  fr: {
    name: "Moteur, marche/arrêt",
    parameters: {
      nominalSpeed: "Vitesse nominale",
      acceleration: "Accélération",
    },
    tags: {
      run: "Marche",
      reverse: "Sens inverse",
      speed: "Vitesse réelle",
    },
  },
} satisfies DriveTypeLabels<
  (typeof MOTOR_ON_OFF_PARAMETERS)[number]["field"],
  (typeof MOTOR_ON_OFF_TAGS)[number]["member"]
>;
