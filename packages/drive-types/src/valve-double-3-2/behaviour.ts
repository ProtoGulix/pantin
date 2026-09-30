import { isSet } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";

// Two independent valves: each coil commands its own port, none sees the other.
export const valveDouble32: DriveStepBehaviour<unknown> = {
  step: ({ commands }) => ({
    ports: {
      port_2: isSet(commands, "coil_12") ? "pressure" : "exhaust",
      port_4: isSet(commands, "coil_14") ? "pressure" : "exhaust",
    },
    state: {},
    feedback: {},
    diagnostics: [],
  }),
};
