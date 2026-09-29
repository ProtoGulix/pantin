import { type Joint, jointTagName, type PantinDocument, type Tag } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { isMovableJoint } from "./joint-types/registry.ts";
import { currentJointPosition } from "./kinematics.ts";

// Tags derived from the joints (ADR 0012, names from ADR 0019 point 6): every
// joint that can move has a "setpoint" command and a "position" feedback, in
// SI units, named "<assembly key of its child>.<tag key>.<member>".

export type JointRuntime = {
  jointPositions: ReadonlyMap<string, number>;
  // Last value written to each setpoint tag.
  setpoints: ReadonlyMap<string, number>;
};

// A validated document always has the child and its assembly, so the empty
// fallback is never used.
function assemblyKeyOf(document: PantinDocument, joint: Joint): string {
  return document.bodies.find((body) => body.id === joint.child)?.assembly ?? "";
}

/** Setpoint then position names of a movable joint; none for a joint that cannot move. */
export function tagNamesOf(document: PantinDocument, joint: Joint): string[] {
  const assemblyKey = assemblyKeyOf(document, joint);
  return isMovableJoint(joint)
    ? [
        jointTagName(assemblyKey, joint.tagKey, "setpoint"),
        jointTagName(assemblyKey, joint.tagKey, "position"),
      ]
    : [];
}

function tagsOfJoint(document: PantinDocument, joint: Joint, runtime: JointRuntime): Tag[] {
  const assemblyKey = assemblyKeyOf(document, joint);
  return [
    {
      name: jointTagName(assemblyKey, joint.tagKey, "setpoint"),
      type: "float",
      direction: "command",
      value: runtime.setpoints.get(joint.id) ?? 0,
    },
    {
      name: jointTagName(assemblyKey, joint.tagKey, "position"),
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

// A wrong member of a real joint ("main.verin.speed") gets that joint's tag
// names; anything else gets the way to list them.
function closestTags(document: PantinDocument, tagName: string): string {
  const prefix = tagName.slice(0, tagName.lastIndexOf(".") + 1);
  const names = document.joints
    .map((joint) => tagNamesOf(document, joint))
    .find((candidate) => candidate[0]?.startsWith(prefix) === true && prefix !== "");
  return names === undefined
    ? "List the tags with GET /api/pantins/<id>/tags."
    : `This joint has "${names.join('" and "')}".`;
}

// The joint whose setpoint `tagName` is. Throws an actionable ApiError when
// the tag does not exist or cannot be written.
export function jointOfCommandTag(document: PantinDocument, tagName: string): Joint {
  const joint = document.joints.find((candidate) =>
    tagNamesOf(document, candidate).includes(tagName),
  );
  if (joint === undefined) {
    throw new ApiError("not_found", `No tag "${tagName}". ${closestTags(document, tagName)}`);
  }
  const [setpoint] = tagNamesOf(document, joint);
  if (tagName !== setpoint) {
    throw new ApiError(
      "invalid_request",
      `Tag "${tagName}" is feedback, written by the core only. Write "${setpoint}" instead.`,
    );
  }
  return joint;
}
