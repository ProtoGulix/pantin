import { isSet } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import { SPOOL_PILOT_12, SPOOL_PILOT_14, spoolPorts } from "../valve-behaviour-common.ts";

// Pilot 14 while the coil is set, the spring brings the spool back to pilot
// 12. The spool is not memory: nothing is kept in the state.
export const valve52Single: DriveStepBehaviour<unknown> = {
  step: ({ commands }) => ({
    ports: spoolPorts(isSet(commands, "coil_14") ? SPOOL_PILOT_14 : SPOOL_PILOT_12, "blocked"),
    state: {},
    feedback: {},
    diagnostics: [],
  }),
};
