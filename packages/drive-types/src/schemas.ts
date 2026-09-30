import { z } from "zod";
import {
  CONTACTOR_PARAMETERS,
  CONTACTOR_PORTS,
  CONTACTOR_TAGS,
  ContactorFieldsSchema,
} from "./contactor/schema.ts";
import type { DrivePort } from "./ports.ts";
import {
  REVERSING_CONTACTOR_PARAMETERS,
  REVERSING_CONTACTOR_PORTS,
  REVERSING_CONTACTOR_TAGS,
  ReversingContactorFieldsSchema,
} from "./reversing-contactor/schema.ts";
import type { DriveParameter, DriveTag } from "./schema-common.ts";
import {
  SERVO_DRIVE_PARAMETERS,
  SERVO_DRIVE_PORTS,
  SERVO_DRIVE_TAGS,
  ServoDriveFieldsSchema,
} from "./servo-drive/schema.ts";
import {
  VALVE_3_2_SINGLE_PARAMETERS,
  VALVE_3_2_SINGLE_PORTS,
  VALVE_3_2_SINGLE_TAGS,
  Valve32SingleFieldsSchema,
} from "./valve-3-2-single/schema.ts";
import {
  VALVE_5_2_DOUBLE_PARAMETERS,
  VALVE_5_2_DOUBLE_PORTS,
  VALVE_5_2_DOUBLE_TAGS,
  Valve52DoubleFieldsSchema,
} from "./valve-5-2-double/schema.ts";
import {
  VALVE_5_2_SINGLE_PARAMETERS,
  VALVE_5_2_SINGLE_PORTS,
  VALVE_5_2_SINGLE_TAGS,
  Valve52SingleFieldsSchema,
} from "./valve-5-2-single/schema.ts";
import {
  VALVE_5_3_CLOSED_PARAMETERS,
  VALVE_5_3_CLOSED_PORTS,
  VALVE_5_3_CLOSED_TAGS,
  Valve53ClosedFieldsSchema,
} from "./valve-5-3-closed/schema.ts";
import {
  VALVE_5_3_EXHAUST_PARAMETERS,
  VALVE_5_3_EXHAUST_PORTS,
  VALVE_5_3_EXHAUST_TAGS,
  Valve53ExhaustFieldsSchema,
} from "./valve-5-3-exhaust/schema.ts";
import {
  VALVE_5_3_PRESSURE_PARAMETERS,
  VALVE_5_3_PRESSURE_PORTS,
  VALVE_5_3_PRESSURE_TAGS,
  Valve53PressureFieldsSchema,
} from "./valve-5-3-pressure/schema.ts";
import {
  VALVE_DOUBLE_3_2_PARAMETERS,
  VALVE_DOUBLE_3_2_PORTS,
  VALVE_DOUBLE_3_2_TAGS,
  ValveDouble32FieldsSchema,
} from "./valve-double-3-2/schema.ts";
import {
  VFD_ANALOG_PARAMETERS,
  VFD_ANALOG_PORTS,
  VFD_ANALOG_TAGS,
  VfdAnalogFieldsSchema,
} from "./vfd-analog/schema.ts";
import {
  VFD_ON_OFF_PARAMETERS,
  VFD_ON_OFF_PORTS,
  VFD_ON_OFF_TAGS,
  VfdOnOffFieldsSchema,
} from "./vfd-on-off/schema.ts";

// Registry of drive type schemas (ADR 0022, 0028), the only part of this
// package the protocol imports: data, no logic. Adding a type means adding its
// folder, then one entry here, in behaviours.ts and in labels.ts; the records
// below are keyed by type, so the compiler asks for them.

export type {
  DriveDiagnostic,
  DriveLanguage,
  DriveParameter,
  DriveParameterKind,
  DriveTag,
  DriveTagType,
  DriveTypeLabels,
} from "./schema-common.ts";

export const DriveFieldsSchema = z.discriminatedUnion("type", [
  Valve32SingleFieldsSchema,
  ValveDouble32FieldsSchema,
  Valve52SingleFieldsSchema,
  Valve52DoubleFieldsSchema,
  Valve53ClosedFieldsSchema,
  Valve53ExhaustFieldsSchema,
  Valve53PressureFieldsSchema,
  ContactorFieldsSchema,
  ReversingContactorFieldsSchema,
  VfdOnOffFieldsSchema,
  VfdAnalogFieldsSchema,
  ServoDriveFieldsSchema,
]);
export type DriveFields = z.infer<typeof DriveFieldsSchema>;
export type DriveType = DriveFields["type"];

export const DRIVE_PARAMETERS: Readonly<Record<DriveType, readonly DriveParameter[]>> = {
  valve_3_2_single: VALVE_3_2_SINGLE_PARAMETERS,
  valve_double_3_2: VALVE_DOUBLE_3_2_PARAMETERS,
  valve_5_2_single: VALVE_5_2_SINGLE_PARAMETERS,
  valve_5_2_double: VALVE_5_2_DOUBLE_PARAMETERS,
  valve_5_3_closed: VALVE_5_3_CLOSED_PARAMETERS,
  valve_5_3_exhaust: VALVE_5_3_EXHAUST_PARAMETERS,
  valve_5_3_pressure: VALVE_5_3_PRESSURE_PARAMETERS,
  contactor: CONTACTOR_PARAMETERS,
  reversing_contactor: REVERSING_CONTACTOR_PARAMETERS,
  vfd_on_off: VFD_ON_OFF_PARAMETERS,
  vfd_analog: VFD_ANALOG_PARAMETERS,
  servo_drive: SERVO_DRIVE_PARAMETERS,
};

export const DRIVE_TAGS: Readonly<Record<DriveType, readonly DriveTag[]>> = {
  valve_3_2_single: VALVE_3_2_SINGLE_TAGS,
  valve_double_3_2: VALVE_DOUBLE_3_2_TAGS,
  valve_5_2_single: VALVE_5_2_SINGLE_TAGS,
  valve_5_2_double: VALVE_5_2_DOUBLE_TAGS,
  valve_5_3_closed: VALVE_5_3_CLOSED_TAGS,
  valve_5_3_exhaust: VALVE_5_3_EXHAUST_TAGS,
  valve_5_3_pressure: VALVE_5_3_PRESSURE_TAGS,
  contactor: CONTACTOR_TAGS,
  reversing_contactor: REVERSING_CONTACTOR_TAGS,
  vfd_on_off: VFD_ON_OFF_TAGS,
  vfd_analog: VFD_ANALOG_TAGS,
  servo_drive: SERVO_DRIVE_TAGS,
};

export const DRIVE_PORTS: Readonly<Record<DriveType, readonly DrivePort[]>> = {
  valve_3_2_single: VALVE_3_2_SINGLE_PORTS,
  valve_double_3_2: VALVE_DOUBLE_3_2_PORTS,
  valve_5_2_single: VALVE_5_2_SINGLE_PORTS,
  valve_5_2_double: VALVE_5_2_DOUBLE_PORTS,
  valve_5_3_closed: VALVE_5_3_CLOSED_PORTS,
  valve_5_3_exhaust: VALVE_5_3_EXHAUST_PORTS,
  valve_5_3_pressure: VALVE_5_3_PRESSURE_PORTS,
  contactor: CONTACTOR_PORTS,
  reversing_contactor: REVERSING_CONTACTOR_PORTS,
  vfd_on_off: VFD_ON_OFF_PORTS,
  vfd_analog: VFD_ANALOG_PORTS,
  servo_drive: SERVO_DRIVE_PORTS,
};
