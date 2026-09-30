import { isSet } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";

// Closed gives the full ratio at once: the contactor has no ramp.
export const contactor: DriveStepBehaviour<unknown> = {
  step: ({ commands }) => ({
    ports: {
      out: isSet(commands, "run") ? { direction: 1, ratio: 1 } : { direction: 0, ratio: 0 },
    },
    state: {},
    feedback: {},
    diagnostics: [],
  }),
};
