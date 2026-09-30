import type { z } from "zod";
import { acPowerOf } from "../ac-power-behaviour-common.ts";
import { clamp, rampToward } from "../behaviour-common.ts";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import type { VfdAnalogFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof VfdAnalogFieldsSchema>;

// The setpoint is clamped to -100..100 %; the feedback is the signed ramped output.
export const vfdAnalog: DriveStepBehaviour<Fields> = {
  step: ({ fields, commands, state, dt }) => {
    const target = clamp(commands.speed_setpoint ?? 0, -100, 100);
    const speed = rampToward(state.speed ?? 0, target, fields.acceleration * dt);
    return {
      ports: { out: acPowerOf(speed) },
      state: { speed },
      feedback: { speed },
      diagnostics: [],
    };
  },
};
