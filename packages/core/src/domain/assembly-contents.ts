import type {
  Absorber,
  Actuator,
  Assembly,
  Belt,
  Body,
  Drive,
  Emitter,
  Guide,
  Joint,
  PantinDocument,
  PresenceSensor,
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
  // Phase 6 objects are in their own assembly, wherever the body they follow is (ADR 0043).
  belts: Belt[];
  guides: Guide[];
  emitters: Emitter[];
  absorbers: Absorber[];
  presenceSensors: PresenceSensor[];
};

/** The sub-assemblies of an assembly at any depth (ADR 0040), in document order. */
export function descendantAssemblies(document: PantinDocument, key: string): Assembly[] {
  const inside = new Set([key]);
  const found = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const assembly of document.assemblies) {
      if (
        !inside.has(assembly.key) &&
        assembly.parent !== undefined &&
        inside.has(assembly.parent)
      ) {
        inside.add(assembly.key);
        found.add(assembly.key);
        grew = true;
      }
    }
  }
  return document.assemblies.filter((assembly) => found.has(assembly.key));
}

/** What a set of assemblies holds, taken as one (ADR 0040 point 8). */
export function contentsOfAssemblies(
  document: PantinDocument,
  keys: ReadonlySet<string>,
): AssemblyContents {
  const bodies = document.bodies.filter((body) => keys.has(body.assembly));
  const bodyIds = new Set(bodies.map(({ id }) => id));
  return {
    bodies,
    joints: document.joints.filter(
      (joint) => bodyIds.has(joint.parent) || bodyIds.has(joint.child),
    ),
    drives: document.drives.filter((drive) => keys.has(drive.assembly)),
    actuators: document.actuators.filter((actuator) => keys.has(actuator.assembly)),
    sensors: document.sensors.filter((sensor) => keys.has(sensor.assembly)),
    belts: document.belts.filter((belt) => keys.has(belt.assembly)),
    guides: document.guides.filter((guide) => keys.has(guide.assembly)),
    emitters: document.emitters.filter((emitter) => keys.has(emitter.assembly)),
    absorbers: document.absorbers.filter((absorber) => keys.has(absorber.assembly)),
    presenceSensors: document.presenceSensors.filter((sensor) => keys.has(sensor.assembly)),
  };
}

export function contentsOfAssembly(document: PantinDocument, key: string): AssemblyContents {
  return contentsOfAssemblies(document, new Set([key]));
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
    ...count(contents.belts, "belt", "belts"),
    ...count(contents.guides, "guide", "guides"),
    ...count(contents.emitters, "emitter", "emitters"),
    ...count(contents.absorbers, "absorber", "absorbers"),
    ...count(contents.presenceSensors, "presence sensor", "presence sensors"),
  ].join(", ");
}
