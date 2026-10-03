import type {
  Actuator,
  Assembly,
  Body,
  Drive,
  Joint,
  PantinDocument,
  Sensor,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";

// What an assembly holds, shared by its plain and its cascading deletion
// (ADR 0019 point 10, ADR 0037).

export function findAssembly(document: PantinDocument, key: string): Assembly {
  const assembly = document.assemblies.find((candidate) => candidate.key === key);
  if (assembly === undefined) {
    throw new ApiError("not_found", `This Pantin has no assembly "${key}".`);
  }
  return assembly;
}

export type AssemblyContents = {
  bodies: Body[];
  // Every joint that touches a body of the assembly, as parent or as child.
  joints: Joint[];
  drives: Drive[];
  actuators: Actuator[];
  sensors: Sensor[];
};

export function contentsOfAssembly(document: PantinDocument, key: string): AssemblyContents {
  const bodies = document.bodies.filter((body) => body.assembly === key);
  const bodyIds = new Set(bodies.map(({ id }) => id));
  return {
    bodies,
    joints: document.joints.filter(
      (joint) => bodyIds.has(joint.parent) || bodyIds.has(joint.child),
    ),
    drives: document.drives.filter((drive) => drive.assembly === key),
    actuators: document.actuators.filter((actuator) => actuator.assembly === key),
    sensors: document.sensors.filter((sensor) => sensor.assembly === key),
  };
}

function count(items: readonly unknown[], singular: string, plural: string): string[] {
  if (items.length === 0) {
    return [];
  }
  return [`${items.length} ${items.length === 1 ? singular : plural}`];
}

/** "2 bodies, 1 joint, 1 drive": the non-empty groups only; "" for an empty assembly. */
export function describeContents(contents: AssemblyContents): string {
  return [
    ...count(contents.bodies, "body", "bodies"),
    ...count(contents.joints, "joint", "joints"),
    ...count(contents.drives, "drive", "drives"),
    ...count(contents.actuators, "actuator", "actuators"),
    ...count(contents.sensors, "sensor", "sensors"),
  ].join(", ");
}
