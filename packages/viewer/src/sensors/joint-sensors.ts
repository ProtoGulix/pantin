import type { CreateSensorRequest, PantinDocument, Sensor } from "@pantin/protocol";
import { movableJoints } from "../drives/drive-form.ts";
import { coordinateLimits } from "../joints/joint-parameters.ts";
import { initialSensorForm, type SensorFormState } from "./sensor-form.ts";

// What a joint's context menu offers for sensors (ADR 0023 point 7): a new
// sensor watching it, or its two end-of-stroke switches at once.

// Each switch is on over this share of the stroke, at its end: 2 mm of a
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
 * The two end-of-stroke switches of a joint with limits, at its lower then its
 * upper end, named "<joint> min" and "<joint> max"; empty for a joint without
 * limits (continuous or fixed).
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
  const ends: [string, [number, number]][] = [
    ["min", [limits.lower, limits.lower + width]],
    ["max", [limits.upper - width, limits.upper]],
  ];
  return ends.map(([end, range]) => ({
    name: `${joint.name} ${end}`,
    assembly,
    joint: jointId,
    type: "position_switch",
    range,
    normallyClosed: false,
  }));
}
