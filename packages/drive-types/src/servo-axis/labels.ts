import type { DriveTypeLabels } from "../schema-common.ts";
import type { SERVO_AXIS_PARAMETERS, SERVO_AXIS_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0022).
export const SERVO_AXIS_LABELS = {
  en: {
    name: "Servo axis",
    parameters: {
      maxSpeed: "Maximum speed",
      maxAcceleration: "Maximum acceleration",
    },
    tags: {
      setpoint: "Position setpoint",
    },
  },
  fr: {
    name: "Axe asservi",
    parameters: {
      maxSpeed: "Vitesse maximale",
      maxAcceleration: "Accélération maximale",
    },
    tags: {
      setpoint: "Consigne de position",
    },
  },
} satisfies DriveTypeLabels<
  (typeof SERVO_AXIS_PARAMETERS)[number]["field"],
  (typeof SERVO_AXIS_TAGS)[number]["member"]
>;
