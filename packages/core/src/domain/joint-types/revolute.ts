import type { Joint } from "@pantin/protocol";
import { clampToLimits, type JointBehaviour, rotationAboutAxis } from "./behaviour.ts";

type RevoluteJoint = Extract<Joint, { type: "revolute" }>;

export const REVOLUTE_BEHAVIOUR: JointBehaviour<RevoluteJoint> = {
  clamp: (joint, coordinate) => clampToLimits(joint.limits, coordinate),
  motion: (joint, coordinate) => rotationAboutAxis(joint.origin, joint.axis, coordinate),
};
