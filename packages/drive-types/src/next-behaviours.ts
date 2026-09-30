import type {
  DriveStepBehaviour,
  DriveStepInput,
  DriveStepOutput,
} from "./behaviour-step-common.ts";
import { contactor } from "./contactor/behaviour.ts";
import type { NextDriveFields, NextDriveType } from "./next-schemas.ts";
import { reversingContactor } from "./reversing-contactor/behaviour.ts";
import { servoDrive } from "./servo-drive/behaviour.ts";
import { valve32Single } from "./valve-3-2-single/behaviour.ts";
import { valve52Double } from "./valve-5-2-double/behaviour.ts";
import { valve52Single } from "./valve-5-2-single/behaviour.ts";
import { valve53Closed } from "./valve-5-3-closed/behaviour.ts";
import { valve53Exhaust } from "./valve-5-3-exhaust/behaviour.ts";
import { valve53Pressure } from "./valve-5-3-pressure/behaviour.ts";
import { valveDouble32 } from "./valve-double-3-2/behaviour.ts";
import { vfdAnalog } from "./vfd-analog/behaviour.ts";
import { vfdOnOff } from "./vfd-on-off/behaviour.ts";

// Registry of the behaviours of the drive types of ADR 0028, for the core only,
// next to the registry of ADR 0022 (behaviours.ts) until slice A3. The record
// is keyed by type, so a type declared in next-schemas.ts without a behaviour
// here does not compile.

export type {
  DriveStepBehaviour,
  DriveStepInput,
  DriveStepOutput,
} from "./behaviour-step-common.ts";

const NEXT_DRIVE_BEHAVIOURS: {
  readonly [Type in NextDriveType]: DriveStepBehaviour<Extract<NextDriveFields, { type: Type }>>;
} = {
  valve_3_2_single: valve32Single,
  valve_double_3_2: valveDouble32,
  valve_5_2_single: valve52Single,
  valve_5_2_double: valve52Double,
  valve_5_3_closed: valve53Closed,
  valve_5_3_exhaust: valve53Exhaust,
  valve_5_3_pressure: valve53Pressure,
  contactor: contactor,
  reversing_contactor: reversingContactor,
  vfd_on_off: vfdOnOff,
  vfd_analog: vfdAnalog,
  servo_drive: servoDrive,
};

// The entry for fields.type handles that type: the record's type above
// guarantees it. No cast: method parameters are compared bivariantly.
function behaviourOf(fields: NextDriveFields): DriveStepBehaviour<NextDriveFields> {
  return NEXT_DRIVE_BEHAVIOURS[fields.type];
}

/** One simulation step of a drive, whatever its type. */
export function stepNextDrive(input: DriveStepInput<NextDriveFields>): DriveStepOutput {
  return behaviourOf(input.fields).step(input);
}
