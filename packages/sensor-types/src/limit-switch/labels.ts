import type { DIRECTIONS, SensorTypeLabels } from "../schema-common.ts";
import type { LIMIT_SWITCH_PARAMETERS, LIMIT_SWITCH_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0023).
export const LIMIT_SWITCH_LABELS = {
  en: {
    name: "Mechanical limit switch",
    parameters: {
      operatingPosition: "Operating position",
      actuation: "Pressed when moving",
      differentialTravel: "Differential travel",
      overtravel: "Overtravel",
      normallyClosed: "Normally closed",
    },
    tags: { state: "State" },
    options: { increasing: "Forwards (+)", decreasing: "Backwards (−)" },
  },
  fr: {
    name: "Fin de course mécanique",
    parameters: {
      operatingPosition: "Point d'action",
      actuation: "Attaqué en allant",
      differentialTravel: "Course différentielle",
      overtravel: "Surcourse",
      normallyClosed: "Normalement fermé",
    },
    tags: { state: "État" },
    options: { increasing: "Vers l'avant (+)", decreasing: "Vers l'arrière (−)" },
  },
} satisfies SensorTypeLabels<
  (typeof LIMIT_SWITCH_PARAMETERS)[number]["field"],
  (typeof LIMIT_SWITCH_TAGS)[number]["member"],
  (typeof DIRECTIONS)[number]
>;
