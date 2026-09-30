import { z } from "zod";
import {
  CYLINDER_SWITCH_PARAMETERS,
  CYLINDER_SWITCH_TAGS,
  CylinderSwitchFieldsSchema,
} from "./cylinder-switch/schema.ts";
import { ENCODER_PARAMETERS, ENCODER_TAGS, EncoderFieldsSchema } from "./encoder/schema.ts";
import {
  INDUCTIVE_SWITCH_PARAMETERS,
  MATERIAL_FACTORS,
  INDUCTIVE_SWITCH_PLACEMENT,
  INDUCTIVE_SWITCH_TAGS,
  InductiveSwitchFieldsSchema,
} from "./inductive-switch/schema.ts";
import {
  LIMIT_SWITCH_PARAMETERS,
  LIMIT_SWITCH_PLACEMENT,
  LIMIT_SWITCH_TAGS,
  LimitSwitchFieldsSchema,
} from "./limit-switch/schema.ts";
import {
  POSITION_SWITCH_PARAMETERS,
  POSITION_SWITCH_TAGS,
  PositionSwitchFieldsSchema,
} from "./position-switch/schema.ts";
import type { PlacementRule, SensorParameter, SensorTag, Stroke } from "./schema-common.ts";

// Registry of sensor type schemas (ADR 0023), the only part of this package
// the protocol imports: data, no logic. Adding a type means adding its folder,
// then one entry in each record here, in labels.ts and in zones.ts (null for a type that is
// not a switch, which then gets its evaluation in evaluators.ts). The records
// here, in labels.ts and in zones.ts are keyed by type, so the compiler asks
// for them; the registry test checks that every type evaluates.

export type {
  SensorLanguage,
  SensorParameter,
  SensorParameterKind,
  SensorTag,
  SensorTypeLabels,
  Stroke,
} from "./schema-common.ts";

// For the core's migration of older documents (ADR 0026).
export { MATERIAL_FACTORS };

export const SensorFieldsSchema = z.discriminatedUnion("type", [
  PositionSwitchFieldsSchema,
  LimitSwitchFieldsSchema,
  CylinderSwitchFieldsSchema,
  InductiveSwitchFieldsSchema,
  EncoderFieldsSchema,
]);
export type SensorFields = z.infer<typeof SensorFieldsSchema>;
export type SensorType = SensorFields["type"];

export const SENSOR_PARAMETERS: Readonly<Record<SensorType, readonly SensorParameter[]>> = {
  position_switch: POSITION_SWITCH_PARAMETERS,
  limit_switch: LIMIT_SWITCH_PARAMETERS,
  cylinder_switch: CYLINDER_SWITCH_PARAMETERS,
  inductive_switch: INDUCTIVE_SWITCH_PARAMETERS,
  encoder: ENCODER_PARAMETERS,
};

export const SENSOR_TAGS: Readonly<Record<SensorType, readonly SensorTag[]>> = {
  position_switch: POSITION_SWITCH_TAGS,
  limit_switch: LIMIT_SWITCH_TAGS,
  cylinder_switch: CYLINDER_SWITCH_TAGS,
  inductive_switch: INDUCTIVE_SWITCH_TAGS,
  encoder: ENCODER_TAGS,
};

type FieldsOf<Type extends SensorType> = Extract<SensorFields, { type: Type }>;

// Placement rules against the joint's stroke (ADR 0026); null for a type
// that may sit anywhere.
const SENSOR_PLACEMENT: {
  readonly [Type in SensorType]: PlacementRule<FieldsOf<Type>> | null;
} = {
  position_switch: null,
  limit_switch: LIMIT_SWITCH_PLACEMENT,
  cylinder_switch: null,
  inductive_switch: INDUCTIVE_SWITCH_PLACEMENT,
  encoder: null,
};

/** What is wrong with this sensor on a joint of this stroke, or null. */
export function sensorPlacementProblem(fields: SensorFields, stroke: Stroke): string | null {
  const rule: PlacementRule<SensorFields> | null = SENSOR_PLACEMENT[fields.type];
  return rule?.problem(fields, stroke) ?? null;
}
