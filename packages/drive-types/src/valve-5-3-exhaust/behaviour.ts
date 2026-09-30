import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import { valve53Step } from "../valve-behaviour-common.ts";

// Centre exhaust; both coils set keep the spool where it was, with a diagnostic.
export const valve53Exhaust: DriveStepBehaviour<unknown> = {
  step: (input) => valve53Step(input, "exhaust"),
};
