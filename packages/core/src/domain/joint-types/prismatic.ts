import type { Joint } from "@pantin/protocol";
import { IDENTITY_ROTATION, normalize, scale } from "../rigid-transform.ts";
import { clampToLimits, type JointBehaviour } from "./behaviour.ts";

type PrismaticJoint = Extract<Joint, { type: "prismatic" }>;

export const PRISMATIC_BEHAVIOUR: JointBehaviour<PrismaticJoint> = {
  clamp: (joint, coordinate) => clampToLimits(joint.limits, coordinate),
  motion: (joint, coordinate) => ({
    rotation: IDENTITY_ROTATION,
    translation: scale(normalize(joint.axis), coordinate),
  }),
};
