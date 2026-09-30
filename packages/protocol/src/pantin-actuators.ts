import type { ActuatorType } from "@pantin/actuator-types/schemas";
import type { z } from "zod";
import type { ActuatorFeed } from "./actuator.ts";
import { JOINT_COORDINATE_UNITS, type JointType } from "./joint.ts";
import { actuatorFeedIssues, type FeedDrive } from "./pantin-actuator-feeds.ts";

// Document rules of actuators (ADR 0028 point 9): unique ids, a known
// assembly, a feed that fits the actuator and its drive (pantin-actuator-feeds.ts),
// joints that exist and can move, each moved by one actuator at most, and one
// coordinate unit per actuator, since its speeds are in that unit.

type ActuatorShape = {
  id: string;
  assembly: string;
  type: ActuatorType;
  feed?: ActuatorFeed | undefined;
  joints: readonly string[];
};

type DocumentShape = {
  assemblies: readonly { key: string }[];
  joints: readonly { id: string; type: JointType }[];
  drives: readonly FeedDrive[];
  actuators: readonly ActuatorShape[];
};

function actuatorIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path: ["actuators", ...path], message });
}

// Each joint of one actuator: movable, not moved by another actuator, and in
// the same unit as the others. Answers the unit, null when it has no joint.
function actuatorJointIssues(
  actuator: ActuatorShape,
  index: number,
  jointTypes: ReadonlyMap<string, JointType>,
  actuatorOfJoint: Map<string, string>,
  context: z.RefinementCtx,
): string | null {
  const units = new Set<string>();
  for (const jointId of actuator.joints) {
    const type = jointTypes.get(jointId);
    const unit = type === undefined ? null : JOINT_COORDINATE_UNITS[type];
    if (unit === null) {
      const message = `Actuator "${actuator.id}" moves "${jointId}", which is not a movable joint of this Pantin.`;
      actuatorIssue(context, [index, "joints"], message);
      continue;
    }
    units.add(unit);
    const other = actuatorOfJoint.get(jointId);
    // A joint listed twice in one actuator is reported by the actuator's schema.
    if (other !== undefined && other !== actuator.id) {
      const message = `Joint "${jointId}" is already moved by actuator "${other}"; a joint has one actuator at most.`;
      actuatorIssue(context, [index, "joints"], message);
    }
    actuatorOfJoint.set(jointId, actuator.id);
  }
  if (units.size > 1) {
    const message = `Actuator "${actuator.id}" moves joints in metres and in radians; its joints must share one unit.`;
    actuatorIssue(context, [index, "joints"], message);
  }
  return units.values().next().value ?? null;
}

export function actuatorIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const assemblies = new Set(document.assemblies.map((assembly) => assembly.key));
  const jointTypes = new Map(document.joints.map((joint) => [joint.id, joint.type]));
  const drives = new Map(document.drives.map((drive) => [drive.id, drive]));
  const actuatorOfJoint = new Map<string, string>();
  const unitOfServoDrive = new Map<string, string>();
  const actuatorIds = new Set<string>();
  for (const [index, actuator] of document.actuators.entries()) {
    if (actuatorIds.has(actuator.id)) {
      const message = `Actuator id "${actuator.id}" is used twice; actuator ids must be unique.`;
      actuatorIssue(context, [index, "id"], message);
    }
    actuatorIds.add(actuator.id);
    if (!assemblies.has(actuator.assembly)) {
      const message = `Actuator "${actuator.id}" is in assembly "${actuator.assembly}", which does not exist.`;
      actuatorIssue(context, [index, "assembly"], message);
    }
    const unit = actuatorJointIssues(actuator, index, jointTypes, actuatorOfJoint, context);
    actuatorFeedIssues({ actuator, index, unit, drives, unitOfServoDrive }, context);
  }
}
