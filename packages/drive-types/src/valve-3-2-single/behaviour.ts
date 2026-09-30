import { isSet } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";

// Coil 12 puts port 2 under pressure; the spring returns it to exhaust.
export const valve32Single: DriveStepBehaviour<unknown> = {
  step: ({ commands }) => ({
    ports: { port_2: isSet(commands, "coil_12") ? "pressure" : "exhaust" },
    state: {},
    feedback: {},
    diagnostics: [],
  }),
};
