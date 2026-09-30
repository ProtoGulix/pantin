import type { SensorTypeLabels } from "../schema-common.ts";
import type { ENCODER_PARAMETERS, ENCODER_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0023).
export const ENCODER_LABELS = {
  en: {
    name: "Encoder",
    parameters: { pulsesPerUnit: "Resolution" },
    tags: { count: "Count" },
  },
  fr: {
    name: "Codeur",
    parameters: { pulsesPerUnit: "Résolution" },
    tags: { count: "Comptage" },
  },
} satisfies SensorTypeLabels<
  (typeof ENCODER_PARAMETERS)[number]["field"],
  (typeof ENCODER_TAGS)[number]["member"]
>;
