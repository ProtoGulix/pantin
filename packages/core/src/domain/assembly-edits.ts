import {
  type Assembly,
  endpointAssemblyIn,
  type JointEndpoint,
  type PantinDocument,
  type Placement,
} from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { newAssembly } from "./assemblies.ts";
import {
  contentsOfAssembly,
  descendantAssemblies,
  describeContents,
  findAssembly,
} from "./assembly-contents.ts";
import { toPlacement, unitTransform } from "./rigid-transform.ts";
import { keyTaken, tagKeyOwners } from "./tag-keys.ts";

function rekeyEndpoint(endpoint: JointEndpoint, rekey: (key: string) => string): JointEndpoint {
  return endpoint.kind === "assembly" ? { kind: "assembly", key: rekey(endpoint.key) } : endpoint;
}

// Edits of assemblies and keys (ADR 0019 points 8 to 10), as pure functions.
// Assembly and joint keys change only here, drive keys in drive-rules.ts and
// sensor keys in sensor-rules.ts: the only edits that rename tags.

export function createAssembly(
  document: PantinDocument,
  name: string,
  parent?: string,
): { document: PantinDocument; assembly: Assembly } {
  if (parent !== undefined) {
    findAssembly(document, parent);
  }
  const assembly = newAssembly(document, name, parent);
  return { document: { ...document, assemblies: [...document.assemblies, assembly] }, assembly };
}

/** The display name only: the key, hence the tags, stay. */
export function renameAssembly(
  document: PantinDocument,
  key: string,
  name: string,
): PantinDocument {
  findAssembly(document, key);
  const assemblies = document.assemblies.map((assembly) =>
    assembly.key === key ? { ...assembly, name } : assembly,
  );
  return { ...document, assemblies };
}

// Only an empty assembly goes: the cascade is deleteAssemblyWithContents
// (ADR 0037), which the message points to.
export function deleteAssembly(document: PantinDocument, key: string): PantinDocument {
  const assembly = findAssembly(document, key);
  if (document.assemblies.some((candidate) => candidate.parent === key)) {
    const names = document.assemblies
      .filter((candidate) => candidate.parent === key)
      .map((candidate) => `"${candidate.name}"`);
    throw new ApiError(
      "conflict",
      `Assembly "${assembly.name}" still contains sub-assemblies: ${names.join(", ")}. Delete it with its contents (DELETE with contents=delete), or move or delete them first.`,
    );
  }
  const holds = describeContents(contentsOfAssembly(document, key));
  if (holds !== "") {
    throw new ApiError(
      "conflict",
      `Assembly "${assembly.name}" still holds ${holds}. Delete it with its contents (DELETE with contents=delete), or move or delete them first.`,
    );
  }
  return { ...document, assemblies: document.assemblies.filter((item) => item.key !== key) };
}

export function renameAssemblyKey(
  document: PantinDocument,
  key: string,
  newKey: string,
): PantinDocument {
  findAssembly(document, key);
  const others = document.assemblies.filter((assembly) => assembly.key !== key);
  const owner = others.find((assembly) => assembly.key === newKey);
  if (owner !== undefined) {
    const takenKeys = new Set(document.assemblies.map((assembly) => assembly.key));
    throw keyTaken(newKey, `assembly "${owner.name}"`, takenKeys);
  }
  const rekey = (candidate: string) => (candidate === key ? newKey : candidate);
  return {
    ...document,
    assemblies: document.assemblies.map((assembly) => ({
      ...assembly,
      key: rekey(assembly.key),
      ...(assembly.parent === undefined ? {} : { parent: rekey(assembly.parent) }),
    })),
    bodies: document.bodies.map((body) => ({ ...body, assembly: rekey(body.assembly) })),
    // A group endpoint names its assembly by key (ADR 0055 point 11).
    joints: document.joints.map((joint) => ({
      ...joint,
      parent: rekeyEndpoint(joint.parent, rekey),
      child: rekeyEndpoint(joint.child, rekey),
    })),
    drives: document.drives.map((drive) => ({ ...drive, assembly: rekey(drive.assembly) })),
    actuators: document.actuators.map((actuator) => ({
      ...actuator,
      assembly: rekey(actuator.assembly),
    })),
    sensors: document.sensors.map((sensor) => ({ ...sensor, assembly: rekey(sensor.assembly) })),
    belts: document.belts.map((belt) => ({ ...belt, assembly: rekey(belt.assembly) })),
    guides: document.guides.map((guide) => ({ ...guide, assembly: rekey(guide.assembly) })),
    emitters: document.emitters.map((emitter) => ({
      ...emitter,
      assembly: rekey(emitter.assembly),
    })),
    absorbers: document.absorbers.map((absorber) => ({
      ...absorber,
      assembly: rekey(absorber.assembly),
    })),
    presenceSensors: document.presenceSensors.map((presenceSensor) => ({
      ...presenceSensor,
      assembly: rekey(presenceSensor.assembly),
    })),
  };
}

// Structure only (ADR 0040 point 7): placements, anchors and tags stay.
export function setAssemblyParent(
  document: PantinDocument,
  key: string,
  parent: string | null,
): PantinDocument {
  const assembly = findAssembly(document, key);
  if (parent !== null) {
    const target = findAssembly(document, parent);
    if (parent === key || descendantAssemblies(document, key).some((sub) => sub.key === parent)) {
      throw new ApiError(
        "conflict",
        `Assembly "${assembly.name}" would contain itself: "${target.name}" is ${parent === key ? "that assembly" : "inside it"}. Pick a parent outside "${assembly.name}".`,
      );
    }
  }
  const assemblies = document.assemblies.map((item) => {
    if (item.key !== key) {
      return item;
    }
    const { parent: _old, ...rest } = item;
    return parent === null ? rest : { ...rest, parent };
  });
  return { ...document, assemblies };
}

export function renameTagKey(
  document: PantinDocument,
  jointId: string,
  tagKey: string,
): PantinDocument {
  const joint = document.joints.find((candidate) => candidate.id === jointId);
  if (joint === undefined) {
    throw new ApiError("not_found", `This Pantin has no joint "${jointId}".`);
  }
  const assembly = endpointAssemblyIn(joint.child, document.bodies) ?? "";
  const taken = tagKeyOwners(document, assembly, { jointId });
  const owner = taken.get(tagKey);
  if (owner !== undefined) {
    // The joint's own key counts as taken: suggesting it back would not help.
    const takenKeys = new Set([...taken.keys(), joint.tagKey]);
    throw keyTaken(tagKey, `${owner} in assembly "${assembly}"`, takenKeys);
  }
  return {
    ...document,
    joints: document.joints.map((item) => (item.id === jointId ? { ...item, tagKey } : item)),
  };
}

// The placement comes from the schema (finite, quaternion within tolerance)
// and is stored normalised. It is relative to the anchor, which this edit does
// not change; nothing else is rewritten, so positions and setpoints stay
// valid (ADR 0033 point 9).
export function setAssemblyPlacement(
  document: PantinDocument,
  key: string,
  placement: Placement,
): PantinDocument {
  findAssembly(document, key);
  const assemblies = document.assemblies.map((assembly) =>
    assembly.key === key
      ? { ...assembly, placement: toPlacement(unitTransform(placement)) }
      : assembly,
  );
  return { ...document, assemblies };
}
