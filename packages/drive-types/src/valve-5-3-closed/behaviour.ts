import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import { valve53Step } from "../valve-behaviour-common.ts";

// Centre closed; both coils set keep the spool where it was, with a diagnostic.
export const valve53Closed: DriveStepBehaviour<unknown> = {
  step: (input) => valve53Step(input, "blocked"),
};
