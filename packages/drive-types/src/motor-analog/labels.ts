import type { DriveTypeLabels } from "../schema-common.ts";
import type { MOTOR_ANALOG_PARAMETERS, MOTOR_ANALOG_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const MOTOR_ANALOG_LABELS = {
  en: {
    name: "Motor, analog speed",
    parameters: {
      acceleration: "Acceleration",
    },
    tags: {
      speed_setpoint: "Speed setpoint",
      speed: "Actual speed",
    },
  },
  fr: {
    name: "Moteur, vitesse analogique",
    parameters: {
      acceleration: "Accélération",
    },
    tags: {
      speed_setpoint: "Consigne de vitesse",
      speed: "Vitesse réelle",
    },
  },
} satisfies DriveTypeLabels<
  (typeof MOTOR_ANALOG_PARAMETERS)[number]["field"],
  (typeof MOTOR_ANALOG_TAGS)[number]["member"]
>;
