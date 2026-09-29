import type { Joint } from "@pantin/protocol";
import { type JointBehaviour, rotationAboutAxis } from "./behaviour.ts";

type ContinuousJoint = Extract<Joint, { type: "continuous" }>;

// No end stops: any angle is kept as is, several turns included.
export const CONTINUOUS_BEHAVIOUR: JointBehaviour<ContinuousJoint> = {
  clamp: (_joint, coordinate) => coordinate,
  motion: (joint, coordinate) => rotationAboutAxis(joint.origin, joint.axis, coordinate),
};
