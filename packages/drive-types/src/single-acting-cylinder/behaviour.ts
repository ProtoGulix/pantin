import type { z } from "zod";
import { type DriveBehaviour, isSet, travelAtSpeed } from "../behaviour-common.ts";
import type { SingleActingCylinderFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof SingleActingCylinderFieldsSchema>;

// The coil extends the cylinder; the spring retracts it as soon as it falls.
export const singleActingCylinder: DriveBehaviour<Fields> = {
  step: ({ fields, commands, joints, dt }) => {
    const extend = isSet(commands, "extend");
    return {
      joints: joints.map((joint) =>
        travelAtSpeed(joint, extend ? joint.upper : joint.lower, fields.speed, dt),
      ),
      state: {},
      feedback: {},
    };
  },
};
