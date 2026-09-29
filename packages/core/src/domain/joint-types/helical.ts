import type { Joint } from "@pantin/protocol";
import { compose, IDENTITY_ROTATION, normalize, scale } from "../rigid-transform.ts";
import { clampToLimits, type JointBehaviour, rotationAboutAxis } from "./behaviour.ts";

type HelicalJoint = Extract<Joint, { type: "helical" }>;

// The coordinate is the travel along the axis; the rotation follows from the
// pitch: one pitch of travel is one turn (ADR 0013 point 7).
export const HELICAL_BEHAVIOUR: JointBehaviour<HelicalJoint> = {
  clamp: (joint, coordinate) => clampToLimits(joint.limits, coordinate),
  motion: (joint, coordinate) => {
    const angle = (2 * Math.PI * coordinate) / joint.pitch;
    const travel = {
      rotation: IDENTITY_ROTATION,
      translation: scale(normalize(joint.axis), coordinate),
    };
    // A translation along the axis and a rotation about it commute: the
    // order does not matter.
    return compose(travel, rotationAboutAxis(joint.origin, joint.axis, angle));
  },
};
