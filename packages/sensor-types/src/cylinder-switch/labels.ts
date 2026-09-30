import type { SensorTypeLabels } from "../schema-common.ts";
import type { CYLINDER_SWITCH_PARAMETERS, CYLINDER_SWITCH_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0023).
export const CYLINDER_SWITCH_LABELS = {
  en: {
    name: "Cylinder sensor (magnetic)",
    parameters: {
      position: "Position on the stroke",
      windowWidth: "Switching window",
      hysteresis: "Hysteresis",
      normallyClosed: "Normally closed",
    },
    tags: { state: "State" },
  },
  fr: {
    name: "Détecteur de vérin (magnétique)",
    parameters: {
      position: "Position sur la course",
      windowWidth: "Fenêtre de commutation",
      hysteresis: "Hystérésis",
      normallyClosed: "Normalement fermé",
    },
    tags: { state: "État" },
  },
} satisfies SensorTypeLabels<
  (typeof CYLINDER_SWITCH_PARAMETERS)[number]["field"],
  (typeof CYLINDER_SWITCH_TAGS)[number]["member"]
>;
