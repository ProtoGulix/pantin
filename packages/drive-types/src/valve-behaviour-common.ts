import { isSet } from "./behaviour-common.ts";
import type { DriveStepInput, DriveStepOutput } from "./behaviour-step-common.ts";
import type { PneumaticState } from "./ports.ts";

// Spool position in a valve's state: 1 is pilot 14 (port 1 to 4, port 2 to
// exhaust), -1 is pilot 12 (port 1 to 2, port 4 to exhaust), 0 the centre of
// a 5/3 valve. A valve never stepped starts on its pilot 12 side (5/2) or in
// its centre (5/3): the rest position of a real valve without air or power.
export const SPOOL_PILOT_14 = 1;
export const SPOOL_PILOT_12 = -1;
const SPOOL_CENTRE = 0;

function spoolOf(state: Readonly<Record<string, number>>, initial: number): number {
  return state.spool ?? initial;
}

/** Both working ports for a spool position; `centre` applies to the centre only. */
export function spoolPorts(spool: number, centre: PneumaticState) {
  if (spool > 0) {
    return { port_2: "exhaust", port_4: "pressure" } as const;
  }
  if (spool < 0) {
    return { port_2: "pressure", port_4: "exhaust" } as const;
  }
  return { port_2: centre, port_4: centre } as const;
}

/**
 * A double solenoid valve: a coil moves the spool to its side, both set keep
 * it where it was, none set keeps it too, unless `rest` says where a 5/3
 * spring brings it back. `conflicts` tells whether both coils raise a diagnostic.
 */
export function doubleSolenoidStep(
  { commands, state }: DriveStepInput<unknown>,
  options: {
    initial: number;
    rest: number | undefined;
    centre: PneumaticState;
    conflicts: boolean;
  },
): DriveStepOutput {
  const coil14 = isSet(commands, "coil_14");
  const coil12 = isSet(commands, "coil_12");
  const previous = spoolOf(state, options.initial);
  let spool = previous;
  if (coil14 !== coil12) {
    spool = coil14 ? SPOOL_PILOT_14 : SPOOL_PILOT_12;
  } else if (!coil14 && options.rest !== undefined) {
    spool = options.rest;
  }
  const both = coil14 && coil12;
  return {
    ports: spoolPorts(spool, options.centre),
    state: { spool },
    feedback: {},
    diagnostics: both && options.conflicts ? ["conflicting_commands"] : [],
  };
}

/** A 5/3 valve: the spring brings the spool to the centre without a coil. */
export function valve53Step(input: DriveStepInput<unknown>, centre: PneumaticState) {
  return doubleSolenoidStep(input, {
    initial: SPOOL_CENTRE,
    rest: SPOOL_CENTRE,
    centre,
    conflicts: true,
  });
}
