import type { Assembly, PantinDocument, RenamedTag } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { newAssembly } from "./assemblies.ts";
import { makeUniqueId } from "./ids.ts";
import { tagNamesOf } from "./joint-tags.ts";

// Edits of assemblies and keys (ADR 0019 points 8 to 10), as pure functions.
// Keys change only here, so these are the only edits that rename tags.

function findAssembly(document: PantinDocument, key: string): Assembly {
  const assembly = document.assemblies.find((candidate) => candidate.key === key);
  if (assembly === undefined) {
    throw new ApiError("not_found", `This Pantin has no assembly "${key}".`);
  }
  return assembly;
}

// A taken key is refused with a free one, so the user can retry at once.
function keyTaken(key: string, owner: string, takenKeys: ReadonlySet<string>): ApiError {
  const free = makeUniqueId(key, takenKeys);
  return new ApiError("conflict", `Key "${key}" is already used by ${owner}. "${free}" is free.`);
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
  };
}

// Tag keys used in `assembly` by the joints whose child is there, but the
// joint `exceptJointId`.
function tagKeysIn(document: PantinDocument, assembly: string, exceptJointId: string | null) {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  return new Map(
    document.joints
      .filter((joint) => joint.id !== exceptJointId && assemblyOf.get(joint.child) === assembly)
      .map((joint) => [joint.tagKey, joint.id]),
  );
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
  const taken = tagKeysIn(document, assembly, jointId);
  const owner = taken.get(tagKey);
  if (owner !== undefined) {
    // The joint's own key counts as taken: suggesting it back would not help.
    const takenKeys = new Set([...taken.keys(), joint.tagKey]);
    throw keyTaken(tagKey, `joint "${owner}" in assembly "${assembly}"`, takenKeys);
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
      : tagKeysIn(document, assembly, parentJoint.id).get(parentJoint.tagKey);
  if (parentJoint !== undefined && owner !== undefined) {
    throw new ApiError(
      "conflict",
      `Tag key "${parentJoint.tagKey}" of joint "${parentJoint.id}" is already used by joint "${owner}" in assembly "${assembly}". Rename one of the tag keys first.`,
    );
  }
  const bodies = document.bodies.map((body) => (body.id === bodyId ? { ...body, assembly } : body));
  return { ...document, bodies };
}

/**
 * Every tag whose name differs between two versions of a document, by joint.
 * Names are paired by position (setpoint, then position). A joint that became
 * fixed or movable gains or loses tags: that is not a rename, so it is not
 * listed.
 */
export function renamedTags(before: PantinDocument, after: PantinDocument): RenamedTag[] {
  return after.joints.flatMap((joint) => {
    const old = before.joints.find((candidate) => candidate.id === joint.id);
    const oldNames = old === undefined ? [] : tagNamesOf(before, old);
    return tagNamesOf(after, joint).flatMap((to, index) => {
      const from = oldNames[index];
      return from === undefined || from === to ? [] : [{ from, to }];
    });
  });
}
