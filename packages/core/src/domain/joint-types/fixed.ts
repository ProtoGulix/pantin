import type { Joint } from "@pantin/protocol";
import { IDENTITY_TRANSFORM } from "../rigid-transform.ts";
import type { JointBehaviour } from "./behaviour.ts";

type FixedJoint = Extract<Joint, { type: "fixed" }>;

export const FIXED_BEHAVIOUR: JointBehaviour<FixedJoint> = {
  clamp: () => 0,
  motion: () => IDENTITY_TRANSFORM,
};
