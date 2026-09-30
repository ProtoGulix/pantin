import type { z } from "zod";
import { type DriveBehaviour, isSet, moveAtVelocity, rampToward } from "../behaviour-common.ts";
import type { MotorOnOffFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof MotorOnOffFieldsSchema>;

// "run" ramps up to the nominal speed, "reverse" makes it negative; without
// "run" the motor ramps down to a stop.
export const motorOnOff: DriveBehaviour<Fields> = {
  step: ({ fields, commands, state, joints, dt }) => {
    const direction = isSet(commands, "reverse") ? -1 : 1;
    const target = isSet(commands, "run") ? direction * fields.nominalSpeed : 0;
    const speed = rampToward(state.speed ?? 0, target, fields.acceleration * dt);
    return {
      joints: joints.map((joint) => moveAtVelocity(joint, speed, dt)),
      state: { speed },
      feedback: { speed },
    };
  },
};
