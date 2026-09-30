import type { ActuatorTypeLabels } from "../schema-common.ts";
import type { SERVO_MOTOR_INPUT_PORTS, SERVO_MOTOR_PARAMETERS } from "./schema.ts";

// What the user reads; the port names themselves stay in English (ADR 0028).
export const SERVO_MOTOR_LABELS = {
  en: {
    name: "Servo motor",
    parameters: {},
    ports: {
      in: "Servo input",
    },
  },
  fr: {
    name: "Servomoteur",
    parameters: {},
    ports: {
      in: "Entrée servo",
    },
  },
} satisfies ActuatorTypeLabels<
  (typeof SERVO_MOTOR_PARAMETERS)[number]["field"],
  (typeof SERVO_MOTOR_INPUT_PORTS)[number]["name"]
>;
