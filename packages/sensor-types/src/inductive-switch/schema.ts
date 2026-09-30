import { z } from "zod";
import {
  DIRECTIONS,
  DirectionSchema,
  finiteNumber,
  NORMALLY_CLOSED_PARAMETER,
  positiveNumber,
  type SensorParameter,
  SWITCH_TAGS,
} from "../schema-common.ts";

// An inductive proximity sensor, the target approaching its face along the
// joint (axial approach). It switches when the gap falls to its nominal
// distance Sn scaled by the target's material, and back once the gap exceeds
// that by the hysteresis (spike 0006: typically 10 %).

export const MATERIALS = ["steel", "stainless_steel", "brass", "aluminium", "copper"] as const;

// Correction factors of the sensing distance, steel Fe360 being 1 (spike
// 0006). Keyed by MATERIALS, so that neither list can miss a material.
export const MATERIAL_FACTORS: Readonly<Record<(typeof MATERIALS)[number], number>> = {
  steel: 1,
  stainless_steel: 0.7,
  brass: 0.4,
  aluminium: 0.35,
  copper: 0.3,
};

export const InductiveSwitchFieldsSchema = z.object({
  type: z.literal("inductive_switch"),
  // Where the target would touch the sensor's face.
  facePosition: finiteNumber("face position"),
  // The way the joint moves to bring the target towards the face.
  approach: DirectionSchema,
  nominalDistance: positiveNumber("nominal distance"),
  material: z.enum(MATERIALS),
  hysteresisPercent: finiteNumber("hysteresis").refine(
    (value) => value >= 0 && value <= 50,
    "The hysteresis must be between 0 and 50 %.",
  ),
  normallyClosed: z.boolean(),
});

export const INDUCTIVE_SWITCH_PARAMETERS = [
  { field: "facePosition", kind: "coordinate" },
  { field: "approach", kind: "choice", options: DIRECTIONS },
  { field: "nominalDistance", kind: "coordinate" },
  { field: "material", kind: "choice", options: MATERIALS },
  { field: "hysteresisPercent", kind: "percent" },
  NORMALLY_CLOSED_PARAMETER,
] as const satisfies readonly SensorParameter[];

export const INDUCTIVE_SWITCH_TAGS = SWITCH_TAGS;
