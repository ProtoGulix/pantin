import type { Joint, PantinDocument, Tag } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { currentJointPosition } from "./kinematics.ts";

// Tags derived from the joints (ADR 0012 point 1): every joint that can move
// has a "setpoint" command and a "position" feedback, in SI units.

const SETPOINT_MEMBER = "setpoint";
const POSITION_MEMBER = "position";

export type JointRuntime = {
  jointPositions: ReadonlyMap<string, number>;
  // Last value written to each setpoint tag.
  setpoints: ReadonlyMap<string, number>;
};

function isMovable(joint: Joint): boolean {
  return joint.type !== "fixed";
}

function tagsOfJoint(joint: Joint, runtime: JointRuntime): Tag[] {
  return [
    {
      name: `${joint.id}.${SETPOINT_MEMBER}`,
      type: "float",
      direction: "command",
      value: runtime.setpoints.get(joint.id) ?? 0,
    },
    {
      name: `${joint.id}.${POSITION_MEMBER}`,
      type: "float",
      direction: "feedback",
      value: currentJointPosition(joint, runtime.jointPositions),
    },
  ];
}

export function describeJointTags(document: PantinDocument, runtime: JointRuntime): Tag[] {
  return document.joints.filter(isMovable).flatMap((joint) => tagsOfJoint(joint, runtime));
}

// The joint whose setpoint `tagName` is. Throws an actionable ApiError when
// the tag does not exist or cannot be written.
export function jointOfCommandTag(document: PantinDocument, tagName: string): Joint {
  const [jointId, member] = tagName.split(".");
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  if (joint === undefined || !isMovable(joint)) {
    throw new ApiError(
      "not_found",
      `No tag "${tagName}". List the tags with GET /api/pantins/<id>/tags.`,
    );
  }
  if (member === POSITION_MEMBER) {
    throw new ApiError(
      "invalid_request",
      `Tag "${tagName}" is feedback, written by the core only. Write "${joint.id}.${SETPOINT_MEMBER}" instead.`,
    );
  }
  if (member !== SETPOINT_MEMBER) {
    throw new ApiError(
      "not_found",
      `No tag "${tagName}". Joint "${joint.id}" has "${SETPOINT_MEMBER}" and "${POSITION_MEMBER}".`,
    );
  }
  return joint;
}
