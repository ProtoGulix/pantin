import type { z } from "zod";
import {
  type DriveBehaviour,
  holdPosition,
  isSet,
  type JointMotion,
  travelAtSpeed,
} from "../behaviour-common.ts";
import type { DoubleActingCylinderFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof DoubleActingCylinderFieldsSchema>;

// "extend" alone drives to the upper limit, "retract" alone to the lower one;
// neither or both hold the position, as a double-acting cylinder without
// spring does when its valve is centred.
export const doubleActingCylinder: DriveBehaviour<Fields> = {
  step: ({ fields, commands, joints, dt }) => {
    const extend = isSet(commands, "extend");
    const retract = isSet(commands, "retract");
    const move = (joint: JointMotion) => {
      if (extend === retract) {
        return holdPosition(joint);
      }
      return travelAtSpeed(joint, extend ? joint.upper : joint.lower, fields.speed, dt);
    };
    return { joints: joints.map(move), state: {}, feedback: {} };
  },
};
