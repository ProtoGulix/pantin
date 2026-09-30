import type { z } from "zod";
import { type DriveBehaviour, moveAtVelocity, rampToward } from "../behaviour-common.ts";
import type { MotorAnalogFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof MotorAnalogFieldsSchema>;

// The motor's speed ramps toward the setpoint; its joints turn or slide at
// that speed until a limit stops them.
export const motorAnalog: DriveBehaviour<Fields> = {
  step: ({ fields, commands, state, joints, dt }) => {
    const speed = rampToward(
      state.speed ?? 0,
      commands.speed_setpoint ?? 0,
      fields.acceleration * dt,
    );
    return {
      joints: joints.map((joint) => moveAtVelocity(joint, speed, dt)),
      state: { speed },
      feedback: { speed },
    };
  },
};
