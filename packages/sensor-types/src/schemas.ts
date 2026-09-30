import { z } from "zod";
import { ENCODER_PARAMETERS, ENCODER_TAGS, EncoderFieldsSchema } from "./encoder/schema.ts";
import {
  POSITION_SWITCH_PARAMETERS,
  POSITION_SWITCH_TAGS,
  PositionSwitchFieldsSchema,
} from "./position-switch/schema.ts";
import type { SensorParameter, SensorTag } from "./schema-common.ts";

// Registry of sensor type schemas (ADR 0023), the only part of this package
// the protocol imports: data, no logic. Adding a type means adding its folder,
// then one entry here, in evaluators.ts and in labels.ts; the records below
// are keyed by type, so the compiler asks for them.

export type {
  SensorLanguage,
  SensorParameter,
  SensorParameterKind,
  SensorTag,
  SensorTypeLabels,
} from "./schema-common.ts";

export const SensorFieldsSchema = z.discriminatedUnion("type", [
  PositionSwitchFieldsSchema,
  EncoderFieldsSchema,
]);
export type SensorFields = z.infer<typeof SensorFieldsSchema>;
export type SensorType = SensorFields["type"];

export const SENSOR_PARAMETERS: Readonly<Record<SensorType, readonly SensorParameter[]>> = {
  position_switch: POSITION_SWITCH_PARAMETERS,
  encoder: ENCODER_PARAMETERS,
};

export const SENSOR_TAGS: Readonly<Record<SensorType, readonly SensorTag[]>> = {
  position_switch: POSITION_SWITCH_TAGS,
  encoder: ENCODER_TAGS,
};
