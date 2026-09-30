import type { CreateSensorRequest, PantinDocument, Sensor } from "@pantin/protocol";
import { movableJoints } from "../actuators/actuator-joints.ts";
import { coordinateLimits } from "../joints/joint-parameters.ts";
import { initialSensorForm, type SensorFormState } from "./sensor-form.ts";

// What a joint's context menu offers for sensors (ADR 0023 point 7): a new
// sensor watching it, or its two end-of-stroke switches at once.

// Each switch is operated this share of the stroke before its end: 2 mm of a
// 100 mm stroke, as in the manifest example of CLAUDE.md section 5.
const END_SWITCH_SHARE = 0.02;

/** The sensors watching a joint, in document order. */
export function sensorsOfJoint(document: PantinDocument, jointId: string): Sensor[] {
  return document.sensors.filter((sensor) => sensor.joint === jointId);
}

function childAssembly(document: PantinDocument, jointId: string): string | undefined {
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  return document.bodies.find((body) => body.id === joint?.child)?.assembly;
}

/** A new sensor watching the joint, named after it, in its child's assembly; null if it cannot move. */
export function sensorFormForJoint(
  document: PantinDocument,
  jointId: string,
): SensorFormState | null {
  const joint = movableJoints(document).find((candidate) => candidate.id === jointId);
  if (joint === undefined) {
    return null;
  }
  const initial = initialSensorForm(document);
  return {
    ...initial,
    name: joint.name,
    assembly: childAssembly(document, jointId) ?? initial.assembly,
    joint: jointId,
  };
}

/**
 * The two end-of-stroke switches of a joint with limits (ADR 0025 point 6):
 * mechanical limit switches operated 2 % of the stroke before each end, with
 * the remaining 2 % as overtravel and a quarter of it as differential travel,
 * named "<joint> min" and "<joint> max"; empty for a joint without limits.
 */
export function endSwitchRequests(
  document: PantinDocument,
  jointId: string,
): CreateSensorRequest[] {
  const joint = movableJoints(document).find((candidate) => candidate.id === jointId);
  const limits = joint === undefined ? null : coordinateLimits(joint);
  const assembly = childAssembly(document, jointId);
  if (joint === undefined || limits === null || assembly === undefined) {
    return [];
  }
  const width = (limits.upper - limits.lower) * END_SWITCH_SHARE;
  // The side of each switch follows from where it stands in the stroke (ADR 0026).
  const ends = [
    { end: "min", operatingPosition: limits.lower + width },
    { end: "max", operatingPosition: limits.upper - width },
  ] as const;
  return ends.map(({ end, operatingPosition }) => ({
    name: `${joint.name} ${end}`,
    assembly,
    joint: jointId,
    type: "limit_switch",
    operatingPosition,
    differentialTravel: width / 4,
    overtravel: width,
    normallyClosed: false,
  }));
}
