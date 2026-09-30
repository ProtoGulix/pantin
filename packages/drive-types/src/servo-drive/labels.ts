import type { DriveTypeLabels } from "../schema-common.ts";
import type { SERVO_DRIVE_PARAMETERS, SERVO_DRIVE_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const SERVO_DRIVE_LABELS = {
  en: {
    name: "Servo drive",
    parameters: {
      maxSpeed: "Maximum speed",
      maxAcceleration: "Maximum acceleration",
    },
    tags: {
      setpoint: "Position setpoint",
      position: "Actual position",
    },
  },
  fr: {
    name: "Variateur d'axe asservi",
    parameters: {
      maxSpeed: "Vitesse maximale",
      maxAcceleration: "Accélération maximale",
    },
    tags: {
      setpoint: "Consigne de position",
      position: "Position réelle",
    },
  },
} satisfies DriveTypeLabels<
  (typeof SERVO_DRIVE_PARAMETERS)[number]["field"],
  (typeof SERVO_DRIVE_TAGS)[number]["member"]
>;
