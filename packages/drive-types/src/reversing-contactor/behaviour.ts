import { directionOf } from "../ac-power-behaviour-common.ts";
import { isSet } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";

// The state holds the closed contactor: 1 forward, -1 reverse, 0 open. With
// both commands set the interlock keeps the one already closed; if none was
// (both set from open), both stay open. A diagnostic flags it meanwhile.
export const reversingContactor: DriveStepBehaviour<unknown> = {
  step: ({ commands, state }) => {
    const forward = isSet(commands, "forward");
    const reverse = isSet(commands, "reverse");
    const both = forward && reverse;
    let direction = 0;
    if (both) {
      direction = state.direction ?? 0;
    } else if (forward) {
      direction = 1;
    } else if (reverse) {
      direction = -1;
    }
    return {
      ports: { out: { direction: directionOf(direction), ratio: Math.abs(direction) } },
      state: { direction },
      feedback: {},
      diagnostics: both ? ["conflicting_commands"] : [],
    };
  },
};
