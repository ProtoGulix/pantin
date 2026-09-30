import type { z } from "zod";
import { acPowerOf } from "../ac-power-behaviour-common.ts";
import { isSet, rampToward } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import type { VfdOnOffFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof VfdOnOffFieldsSchema>;

// The state holds the signed ramped speed in percent: reversing while running
// ramps down through 0 then up the other way. The feedback is its magnitude,
// the direction being the `reverse` bit (ADR 0028 point 6).
export const vfdOnOff: DriveStepBehaviour<Fields> = {
  step: ({ fields, commands, state, dt }) => {
    const direction = isSet(commands, "reverse") ? -1 : 1;
    const target = isSet(commands, "run") ? direction * 100 : 0;
    const speed = rampToward(state.speed ?? 0, target, fields.acceleration * dt);
    return {
      ports: { out: acPowerOf(speed) },
      state: { speed },
      feedback: { speed: Math.abs(speed) },
      diagnostics: [],
    };
  },
};
