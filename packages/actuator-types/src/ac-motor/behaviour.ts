import type { z } from "zod";
import { acPowerPort, holdPosition, moveAtVelocity } from "../behaviour-common.ts";
import type { ActuatorBehaviour } from "../behaviour-step-common.ts";
import type { AcMotorFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof AcMotorFieldsSchema>;

// A contactor gives the full ratio at once, so the motor reaches its speed in
// one step: it has no inertia until loads are modelled (ADR 0028 point 8).
export const acMotor: ActuatorBehaviour<Fields> = {
  step: ({ fields, ports, joints, dt }) => {
    const power = acPowerPort(ports, "in");
    return {
      joints: joints.map((joint) =>
        power === undefined
          ? holdPosition(joint)
          : moveAtVelocity(joint, power.direction * power.ratio * fields.nominalSpeed, dt),
      ),
    };
  },
};
