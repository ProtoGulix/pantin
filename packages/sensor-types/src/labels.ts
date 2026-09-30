import { ENCODER_LABELS } from "./encoder/labels.ts";
import { POSITION_SWITCH_LABELS } from "./position-switch/labels.ts";
import type { SensorLanguage } from "./schema-common.ts";
import type { SensorType } from "./schemas.ts";

// Registry of sensor type labels, for clients (ADR 0023). Each type's own
// labels.ts is typed after its schema, so a missing label does not compile.

export interface SensorLabels {
  name: string;
  parameters: Readonly<Record<string, string>>;
  tags: Readonly<Record<string, string>>;
}

export const SENSOR_LABELS: Readonly<
  Record<SensorType, Readonly<Record<SensorLanguage, SensorLabels>>>
> = {
  position_switch: POSITION_SWITCH_LABELS,
  encoder: ENCODER_LABELS,
};
