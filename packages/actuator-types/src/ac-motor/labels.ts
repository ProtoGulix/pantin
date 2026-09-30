import type { ActuatorTypeLabels } from "../schema-common.ts";
import type { AC_MOTOR_INPUT_PORTS, AC_MOTOR_PARAMETERS } from "./schema.ts";

// What the user reads; the port names themselves stay in English (ADR 0028).
export const AC_MOTOR_LABELS = {
  en: {
    name: "AC motor",
    parameters: {
      nominalSpeed: "Nominal speed",
    },
    ports: {
      in: "Power input",
    },
  },
  fr: {
    name: "Moteur alternatif",
    parameters: {
      nominalSpeed: "Vitesse nominale",
    },
    ports: {
      in: "Alimentation",
    },
  },
} satisfies ActuatorTypeLabels<
  (typeof AC_MOTOR_PARAMETERS)[number]["field"],
  (typeof AC_MOTOR_INPUT_PORTS)[number]["name"]
>;
