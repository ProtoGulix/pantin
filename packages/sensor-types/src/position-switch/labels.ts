import type { SensorTypeLabels } from "../schema-common.ts";
import type { POSITION_SWITCH_PARAMETERS, POSITION_SWITCH_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0023).
export const POSITION_SWITCH_LABELS = {
  en: {
    name: "Position switch",
    parameters: { range: "Actuated between", normallyClosed: "Normally closed" },
    tags: { state: "State" },
  },
  fr: {
    name: "Fin de course",
    parameters: { range: "Actionné entre", normallyClosed: "Normalement fermé" },
    tags: { state: "État" },
  },
} satisfies SensorTypeLabels<
  (typeof POSITION_SWITCH_PARAMETERS)[number]["field"],
  (typeof POSITION_SWITCH_TAGS)[number]["member"]
>;
