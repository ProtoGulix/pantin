import type { z } from "zod";
import type { DriveStepBehaviour } from "../behaviour-step-common.ts";
import type { ServoDriveFieldsSchema } from "./schema.ts";

type Fields = z.infer<typeof ServoDriveFieldsSchema>;

// Reports the position of the joint furthest from the setpoint, so that one
// jammed joint among several stays visible (ADR 0028 point 7); the first of
// equals wins. With no joint to read, the drive reports its setpoint.
function furthestFrom(setpoint: number, positions: readonly number[]): number {
  let furthest = setpoint;
  let gap = -1;
  for (const position of positions) {
    if (Math.abs(position - setpoint) > gap) {
      furthest = position;
      gap = Math.abs(position - setpoint);
    }
  }
  return furthest;
}

// A setpoint never written reads 0, as for the servo axis of ADR 0022.
export const servoDrive: DriveStepBehaviour<Fields> = {
  step: ({ fields, commands, jointPositions }) => {
    const setpoint = commands.setpoint ?? 0;
    return {
      ports: {
        out: { setpoint, maxSpeed: fields.maxSpeed, maxAcceleration: fields.maxAcceleration },
      },
      state: {},
      feedback: { position: furthestFrom(setpoint, jointPositions) },
      diagnostics: [],
    };
  },
};
