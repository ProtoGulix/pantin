import type { Assembly, PantinDocument } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { newAssembly } from "./assemblies.ts";
import { keyTaken, tagKeyOwners } from "./tag-keys.ts";

// Edits of assemblies and keys (ADR 0019 points 8 to 10), as pure functions.
// Assembly and joint keys change only here, drive keys in drive-rules.ts and
// sensor keys in sensor-rules.ts: the only edits that rename tags.

function findAssembly(document: PantinDocument, key: string): Assembly {
  const assembly = document.assemblies.find((candidate) => candidate.key === key);
  if (assembly === undefined) {
    throw new ApiError("not_found", `This Pantin has no assembly "${key}".`);
  }
  return assembly;
}

export function createAssembly(
  document: PantinDocument,
  name: string,
): { document: PantinDocument; assembly: Assembly } {
  const assembly = newAssembly(document, name);
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

export function deleteAssembly(document: PantinDocument, key: string): PantinDocument {
  const assembly = findAssembly(document, key);
  const count = document.bodies.filter((body) => body.assembly === key).length;
  if (count > 0) {
    const bodies = count === 1 ? "1 body" : `${count} bodies`;
    throw new ApiError(
      "conflict",
      `Assembly "${assembly.name}" still holds ${bodies}. Move or delete them first.`,
    );
  }
  for (const [kind, owners] of [
    ["drive", document.drives],
    ["actuator", document.actuators],
    ["sensor", document.sensors],
  ] as const) {
    const ids = owners.filter((owner) => owner.assembly === key).map(({ id }) => id);
    if (ids.length > 0) {
      throw new ApiError(
        "conflict",
        `Assembly "${assembly.name}" still holds ${kind} "${ids.join('", "')}". Move or delete it first.`,
      );
    }
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
    assemblies: document.assemblies.map((assembly) => ({ ...assembly, key: rekey(assembly.key) })),
    bodies: document.bodies.map((body) => ({ ...body, assembly: rekey(body.assembly) })),
    drives: document.drives.map((drive) => ({ ...drive, assembly: rekey(drive.assembly) })),
    actuators: document.actuators.map((actuator) => ({
      ...actuator,
      assembly: rekey(actuator.assembly),
    })),
    sensors: document.sensors.map((sensor) => ({ ...sensor, assembly: rekey(sensor.assembly) })),
  };
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
  const assembly = document.bodies.find((body) => body.id === joint.child)?.assembly ?? "";
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

// The joint whose child is the body moves with it; its tag key must be free
// there (ADR 0019 point 9: no automatic suffix, it would bring back "tige-2").
export function moveBody(
  document: PantinDocument,
  bodyId: string,
  assembly: string,
): PantinDocument {
  findAssembly(document, assembly);
  if (!document.bodies.some((body) => body.id === bodyId)) {
    throw new ApiError("not_found", `This Pantin has no body "${bodyId}".`);
  }
  const parentJoint = document.joints.find((joint) => joint.child === bodyId);
  const owner =
    parentJoint === undefined
      ? undefined
      : tagKeyOwners(document, assembly, { jointId: parentJoint.id }).get(parentJoint.tagKey);
  if (parentJoint !== undefined && owner !== undefined) {
    throw new ApiError(
      "conflict",
      `Tag key "${parentJoint.tagKey}" of joint "${parentJoint.id}" is already used by ${owner} in assembly "${assembly}". Rename one of the tag keys first.`,
    );
  }
  const bodies = document.bodies.map((body) => (body.id === bodyId ? { ...body, assembly } : body));
  return { ...document, bodies };
}
