import type { z } from "zod";
import { JOINT_COORDINATE_UNITS, type JointType } from "./joint.ts";

// Document rules of drives (ADR 0022 point 4): unique ids, a known assembly,
// joints that exist and can move, each moved by one drive at most, and one
// coordinate unit per drive, since its speeds are in that unit.

type DocumentShape = {
  assemblies: readonly { key: string }[];
  joints: readonly { id: string; type: JointType }[];
  drives: readonly { id: string; assembly: string; joints: readonly string[] }[];
};

function issue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path: ["drives", ...path], message });
}

type DriveShape = DocumentShape["drives"][number];

// Each joint of one drive: movable, not moved by another drive, and in the
// same unit as the others.
function driveJointIssues(
  drive: DriveShape,
  index: number,
  jointTypes: ReadonlyMap<string, JointType>,
  driveOfJoint: Map<string, string>,
  context: z.RefinementCtx,
): void {
  const units = new Set<string>();
  for (const jointId of drive.joints) {
    const type = jointTypes.get(jointId);
    const unit = type === undefined ? null : JOINT_COORDINATE_UNITS[type];
    if (unit === null) {
      const message = `Drive "${drive.id}" moves "${jointId}", which is not a movable joint of this Pantin.`;
      issue(context, [index, "joints"], message);
      continue;
    }
    units.add(unit);
    const other = driveOfJoint.get(jointId);
    // A joint listed twice in one drive is reported by the drive's schema.
    if (other !== undefined && other !== drive.id) {
      const message = `Joint "${jointId}" is already moved by drive "${other}"; a joint has one drive at most.`;
      issue(context, [index, "joints"], message);
    }
    driveOfJoint.set(jointId, drive.id);
  }
  if (units.size > 1) {
    const message = `Drive "${drive.id}" moves joints in metres and in radians; its joints must share one unit.`;
    issue(context, [index, "joints"], message);
  }
}

export function driveIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const assemblies = new Set(document.assemblies.map((assembly) => assembly.key));
  const jointTypes = new Map(document.joints.map((joint) => [joint.id, joint.type]));
  const driveOfJoint = new Map<string, string>();
  const driveIds = new Set<string>();
  for (const [index, drive] of document.drives.entries()) {
    if (driveIds.has(drive.id)) {
      issue(
        context,
        [index, "id"],
        `Drive id "${drive.id}" is used twice; drive ids must be unique.`,
      );
    }
    driveIds.add(drive.id);
    if (!assemblies.has(drive.assembly)) {
      const message = `Drive "${drive.id}" is in assembly "${drive.assembly}", which does not exist.`;
      issue(context, [index, "assembly"], message);
    }
    driveJointIssues(drive, index, jointTypes, driveOfJoint, context);
  }
}
