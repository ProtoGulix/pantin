import type { Joint, PantinDocument, Tag } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { isMovableJoint } from "./joint-types/registry.ts";
import { currentJointPosition } from "./kinematics.ts";

// Tags derived from the joints (ADR 0012, names from ADR 0019 point 6): every
// joint that can move has a "setpoint" command and a "position" feedback, in
// SI units, named "<assembly key of its child>.<tag key>.<member>".

const SETPOINT_MEMBER = "setpoint";
const POSITION_MEMBER = "position";

export type JointRuntime = {
  jointPositions: ReadonlyMap<string, number>;
  // Last value written to each setpoint tag.
  setpoints: ReadonlyMap<string, number>;
};

// "<assembly key>.<tag key>": the tag names of a joint without their member.
// A validated document always has the child and its assembly, so the empty
// fallback is never used.
function tagPrefixOf(document: PantinDocument, joint: Joint): string {
  const child = document.bodies.find((body) => body.id === joint.child);
  return `${child?.assembly ?? ""}.${joint.tagKey}`;
}

/** Both tag names of a movable joint; none for a joint that cannot move. */
export function tagNamesOf(document: PantinDocument, joint: Joint): string[] {
  const prefix = tagPrefixOf(document, joint);
  return isMovableJoint(joint)
    ? [`${prefix}.${SETPOINT_MEMBER}`, `${prefix}.${POSITION_MEMBER}`]
    : [];
}

function tagsOfJoint(document: PantinDocument, joint: Joint, runtime: JointRuntime): Tag[] {
  const prefix = tagPrefixOf(document, joint);
  return [
    {
      name: `${prefix}.${SETPOINT_MEMBER}`,
      type: "float",
      direction: "command",
      value: runtime.setpoints.get(joint.id) ?? 0,
    },
    {
      name: `${prefix}.${POSITION_MEMBER}`,
      type: "float",
      direction: "feedback",
      value: currentJointPosition(joint, runtime.jointPositions),
    },
  ];
}

export function describeJointTags(document: PantinDocument, runtime: JointRuntime): Tag[] {
  return document.joints
    .filter(isMovableJoint)
    .flatMap((joint) => tagsOfJoint(document, joint, runtime));
}

// The joint whose setpoint `tagName` is. Throws an actionable ApiError when
// the tag does not exist or cannot be written.
export function jointOfCommandTag(document: PantinDocument, tagName: string): Joint {
  const member = tagName.slice(tagName.lastIndexOf(".") + 1);
  const prefix = tagName.slice(0, tagName.lastIndexOf("."));
  const joint = document.joints.find((candidate) => tagPrefixOf(document, candidate) === prefix);
  if (joint === undefined || !isMovableJoint(joint)) {
    throw new ApiError(
      "not_found",
      `No tag "${tagName}". List the tags with GET /api/pantins/<id>/tags.`,
    );
  }
  if (member === POSITION_MEMBER) {
    throw new ApiError(
      "invalid_request",
      `Tag "${tagName}" is feedback, written by the core only. Write "${prefix}.${SETPOINT_MEMBER}" instead.`,
    );
  }
  if (member !== SETPOINT_MEMBER) {
    throw new ApiError(
      "not_found",
      `No tag "${tagName}". Joint "${joint.id}" has "${prefix}.${SETPOINT_MEMBER}" and "${prefix}.${POSITION_MEMBER}".`,
    );
  }
  return joint;
}
