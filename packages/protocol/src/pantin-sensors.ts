import type { z } from "zod";
import { JOINT_COORDINATE_UNITS, type JointType } from "./joint.ts";

// Document rules of sensors (ADR 0023 point 3): unique ids, a known assembly,
// and a joint that exists and can move. Tag prefixes are checked with those
// of joints and drives (pantin-assemblies.ts).

type DocumentShape = {
  assemblies: readonly { key: string }[];
  joints: readonly { id: string; type: JointType }[];
  sensors: readonly { id: string; assembly: string; joint: string }[];
};

function issue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path: ["sensors", ...path], message });
}

export function sensorIssues(document: DocumentShape, context: z.RefinementCtx): void {
  const assemblies = new Set(document.assemblies.map((assembly) => assembly.key));
  const jointTypes = new Map(document.joints.map((joint) => [joint.id, joint.type]));
  const sensorIds = new Set<string>();
  for (const [index, sensor] of document.sensors.entries()) {
    if (sensorIds.has(sensor.id)) {
      const message = `Sensor id "${sensor.id}" is used twice; sensor ids must be unique.`;
      issue(context, [index, "id"], message);
    }
    sensorIds.add(sensor.id);
    if (!assemblies.has(sensor.assembly)) {
      const message = `Sensor "${sensor.id}" is in assembly "${sensor.assembly}", which does not exist.`;
      issue(context, [index, "assembly"], message);
    }
    const type = jointTypes.get(sensor.joint);
    if (type === undefined || JOINT_COORDINATE_UNITS[type] === null) {
      const message = `Sensor "${sensor.id}" watches "${sensor.joint}", which is not a movable joint of this Pantin.`;
      issue(context, [index, "joint"], message);
    }
  }
}
