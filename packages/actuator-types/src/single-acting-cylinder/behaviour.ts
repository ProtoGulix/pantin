import type { z } from "zod";
import { holdPosition, pneumaticPort, travelAtSpeed } from "../behaviour-common.ts";
import type { ActuatorBehaviour } from "../behaviour-step-common.ts";
import type { SingleActingCylinderFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof SingleActingCylinderFieldsSchema>;

// Pressure extends, exhaust lets the spring return it, blocked holds.
export const singleActingCylinder: ActuatorBehaviour<Fields> = {
  step: ({ fields, ports, joints, dt }) => {
    const cap = pneumaticPort(ports, "cap");
    return {
      joints: joints.map((joint) => {
        if (cap === "pressure") {
          return travelAtSpeed(joint, joint.upper, fields.extendSpeed, dt);
        }
        return cap === "exhaust"
          ? travelAtSpeed(joint, joint.lower, fields.returnSpeed, dt)
          : holdPosition(joint);
      }),
    };
  },
};
