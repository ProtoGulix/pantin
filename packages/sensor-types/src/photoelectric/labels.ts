import type { SensorTypeLabels } from "../schema-common.ts";
import type { PHOTOELECTRIC_PARAMETERS, PHOTOELECTRIC_TAGS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0023).
export const PHOTOELECTRIC_LABELS = {
  en: {
    name: "Photoelectric cell",
    parameters: {
      mode: "Mode",
      range: "Range",
      normallyClosed: "Normally closed",
      onDelay: "On delay",
      offDelay: "Off delay",
    },
    tags: { state: "State" },
    options: { diffuse: "Diffuse", through_beam: "Through-beam" },
  },
  fr: {
    name: "Cellule photoélectrique",
    parameters: {
      mode: "Mode",
      range: "Portée",
      normallyClosed: "Normalement fermé",
      onDelay: "Retard à l'enclenchement",
      offDelay: "Retard au déclenchement",
    },
    tags: { state: "État" },
    options: { diffuse: "Réflex", through_beam: "Barrage" },
  },
} satisfies SensorTypeLabels<
  (typeof PHOTOELECTRIC_PARAMETERS)[number]["field"],
  (typeof PHOTOELECTRIC_TAGS)[number]["member"],
  "diffuse" | "through_beam"
>;
