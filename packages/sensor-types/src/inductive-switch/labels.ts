import type { DIRECTIONS, SensorTypeLabels } from "../schema-common.ts";
import type { INDUCTIVE_SWITCH_PARAMETERS, INDUCTIVE_SWITCH_TAGS, MATERIALS } from "./schema.ts";

// What the user reads; the tag members themselves stay in English (ADR 0023).
export const INDUCTIVE_SWITCH_LABELS = {
  en: {
    name: "Inductive sensor (axial)",
    parameters: {
      facePosition: "Face position",
      approach: "Target approaching",
      nominalDistance: "Nominal distance Sn",
      material: "Target material",
      hysteresisPercent: "Hysteresis",
      normallyClosed: "Normally closed",
    },
    tags: { state: "State" },
    options: {
      increasing: "Forwards (+)",
      decreasing: "Backwards (−)",
      steel: "Steel (× 1)",
      stainless_steel: "Stainless steel (× 0.7)",
      brass: "Brass (× 0.4)",
      aluminium: "Aluminium (× 0.35)",
      copper: "Copper (× 0.3)",
    },
  },
  fr: {
    name: "Détecteur inductif (axial)",
    parameters: {
      facePosition: "Position de la face",
      approach: "Cible arrivant",
      nominalDistance: "Portée nominale Sn",
      material: "Matière de la cible",
      hysteresisPercent: "Hystérésis",
      normallyClosed: "Normalement fermé",
    },
    tags: { state: "État" },
    options: {
      increasing: "Vers l'avant (+)",
      decreasing: "Vers l'arrière (−)",
      steel: "Acier (× 1)",
      stainless_steel: "Inox (× 0,7)",
      brass: "Laiton (× 0,4)",
      aluminium: "Aluminium (× 0,35)",
      copper: "Cuivre (× 0,3)",
    },
  },
} satisfies SensorTypeLabels<
  (typeof INDUCTIVE_SWITCH_PARAMETERS)[number]["field"],
  (typeof INDUCTIVE_SWITCH_TAGS)[number]["member"],
  (typeof DIRECTIONS)[number] | (typeof MATERIALS)[number]
>;
