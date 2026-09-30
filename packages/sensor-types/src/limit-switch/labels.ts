import type { SensorTypeLabels } from "../schema-common.ts";
import type { LIMIT_SWITCH_PARAMETERS, LIMIT_SWITCH_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0023).
export const LIMIT_SWITCH_LABELS = {
  en: {
    name: "Mechanical limit switch",
    parameters: {
      operatingPosition: "Operating position",
      differentialTravel: "Differential travel",
      overtravel: "Overtravel",
      normallyClosed: "Normally closed",
    },
    tags: { state: "State" },
  },
  fr: {
    name: "Fin de course mécanique",
    parameters: {
      operatingPosition: "Point d'action",
      differentialTravel: "Course différentielle",
      overtravel: "Surcourse",
      normallyClosed: "Normalement fermé",
    },
    tags: { state: "État" },
  },
} satisfies SensorTypeLabels<
  (typeof LIMIT_SWITCH_PARAMETERS)[number]["field"],
  (typeof LIMIT_SWITCH_TAGS)[number]["member"]
>;
