import type { z } from "zod";
import {
  holdPosition,
  type JointMotion,
  pneumaticPort,
  travelAtSpeed,
} from "../behaviour-common.ts";
import type { ActuatorBehaviour } from "../behaviour-step-common.ts";
import type { DoubleActingCylinderFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof DoubleActingCylinderFieldsSchema>;

// A chamber that is blocked is full of trapped air that cannot move, so a
// cylinder moves only when a chamber is under pressure and the opposite one
// can give way: exhausted, or under pressure too. Every other combination
// holds: both blocked, both exhausted (no load model yet, ADR 0028), and a
// pressure against a blocked chamber (cap pressure with rod blocked, rod
// pressure with cap blocked) or an exhaust beside a blocked chamber. Both
// under pressure extends: the cap side has the larger area.
export const doubleActingCylinder: ActuatorBehaviour<Fields> = {
  step: ({ fields, ports, joints, dt }) => {
    const cap = pneumaticPort(ports, "cap");
    const rod = pneumaticPort(ports, "rod");
    const extending = cap === "pressure" && (rod === "exhaust" || rod === "pressure");
    const retracts = rod === "pressure" && cap === "exhaust";
    const move = (joint: JointMotion) => {
      if (extending) {
        return travelAtSpeed(joint, joint.upper, fields.extendSpeed, dt);
      }
      return retracts
        ? travelAtSpeed(joint, joint.lower, fields.retractSpeed, dt)
        : holdPosition(joint);
    };
    return { joints: joints.map(move) };
  },
};
