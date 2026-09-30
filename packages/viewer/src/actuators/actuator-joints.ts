import {
  type Actuator,
  JOINT_COORDINATE_UNITS,
  type JointCoordinateUnit,
  type PantinDocument,
} from "@pantin/protocol";

// Which joints an actuator can move, and which actuator moves a joint (ADR
// 0028 point 9): a joint is moved by one actuator at most, and an actuator's
// joints share their unit.

/** The joints an actuator can move: those whose type has a coordinate. */
export function movableJoints(document: PantinDocument) {
  return document.joints.filter((joint) => JOINT_COORDINATE_UNITS[joint.type] !== null);
}

/** The actuator that moves a joint, if any. */
export function actuatorOfJoint(document: PantinDocument, jointId: string): Actuator | undefined {
  return document.actuators.find((actuator) => actuator.joints.includes(jointId));
}

/** The unit of the joints; metres until a joint is chosen. */
export function jointsCoordinateUnit(
  document: PantinDocument,
  jointIds: readonly string[],
): JointCoordinateUnit {
  const joint = document.joints.find((candidate) => jointIds.includes(candidate.id));
  return joint === undefined ? "metre" : JOINT_COORDINATE_UNITS[joint.type];
}

/**
 * The unit of the joints a drive ends up moving, through the actuators it
 * feeds: what a servo drive's setpoint and feedback are in (ADR 0028 point 6).
 * Metres when it feeds none yet.
 */
export function driveCoordinateUnit(document: PantinDocument, driveId: string | null) {
  const fed = document.actuators.find(
    (actuator) =>
      driveId !== null && actuator.feed?.drive === driveId && actuator.joints.length > 0,
  );
  return jointsCoordinateUnit(document, fed?.joints ?? []);
}
