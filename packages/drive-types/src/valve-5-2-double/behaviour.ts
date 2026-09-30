import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import { doubleSolenoidStep, SPOOL_PILOT_12 } from "../valve-behaviour-common.ts";

// Memory valve: a never-stepped valve starts on its pilot 12 side. Both coils
// set keep the spool where it was and raise no diagnostic (ADR 0028 point 5).
export const valve52Double: DriveStepBehaviour<unknown> = {
  step: (input) =>
    doubleSolenoidStep(input, {
      initial: SPOOL_PILOT_12,
      rest: undefined,
      centre: "blocked",
      conflicts: false,
    }),
};
