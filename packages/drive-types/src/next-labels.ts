import { CONTACTOR_LABELS } from "./contactor/labels.ts";
import type { DriveLabels } from "./labels.ts";
import type { NextDriveType } from "./next-schemas.ts";
import { REVERSING_CONTACTOR_LABELS } from "./reversing-contactor/labels.ts";
import type { DriveLanguage } from "./schema-common.ts";
import { SERVO_DRIVE_LABELS } from "./servo-drive/labels.ts";
import { VALVE_3_2_SINGLE_LABELS } from "./valve-3-2-single/labels.ts";
import { VALVE_5_2_DOUBLE_LABELS } from "./valve-5-2-double/labels.ts";
import { VALVE_5_2_SINGLE_LABELS } from "./valve-5-2-single/labels.ts";
import { VALVE_5_3_CLOSED_LABELS } from "./valve-5-3-closed/labels.ts";
import { VALVE_5_3_EXHAUST_LABELS } from "./valve-5-3-exhaust/labels.ts";
import { VALVE_5_3_PRESSURE_LABELS } from "./valve-5-3-pressure/labels.ts";
import { VALVE_DOUBLE_3_2_LABELS } from "./valve-double-3-2/labels.ts";
import { VFD_ANALOG_LABELS } from "./vfd-analog/labels.ts";
import { VFD_ON_OFF_LABELS } from "./vfd-on-off/labels.ts";

// Registry of the labels of the drive types of ADR 0028, for clients, next to
// labels.ts (ADR 0022) until slice A3.

export const NEXT_DRIVE_LABELS: Readonly<
  Record<NextDriveType, Readonly<Record<DriveLanguage, DriveLabels>>>
> = {
  valve_3_2_single: VALVE_3_2_SINGLE_LABELS,
  valve_double_3_2: VALVE_DOUBLE_3_2_LABELS,
  valve_5_2_single: VALVE_5_2_SINGLE_LABELS,
  valve_5_2_double: VALVE_5_2_DOUBLE_LABELS,
  valve_5_3_closed: VALVE_5_3_CLOSED_LABELS,
  valve_5_3_exhaust: VALVE_5_3_EXHAUST_LABELS,
  valve_5_3_pressure: VALVE_5_3_PRESSURE_LABELS,
  contactor: CONTACTOR_LABELS,
  reversing_contactor: REVERSING_CONTACTOR_LABELS,
  vfd_on_off: VFD_ON_OFF_LABELS,
  vfd_analog: VFD_ANALOG_LABELS,
  servo_drive: SERVO_DRIVE_LABELS,
};
