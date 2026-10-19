import { isJsonObject, type JsonObject } from "./json-object.ts";

// Version 13 makes the ends of a joint a body or a group (ADR 0055 point 9).
// Every end becomes a body; then the child of each joint between two
// assemblies becomes the assembly of that child body, so the assembly is the
// group the joint moves. Poses and tag prefixes do not change: the old anchor
// body of an assembly now follows its group, and the internal fixed joints of
// the old star keep their bodies glued to it. A document the new rules refuse
// (an assembly anchored twice, say) is not rewritten differently: the schema
// then explains it.

type Bodies = ReadonlyMap<string, string>;

function assemblyOfBodies(document: JsonObject): Bodies {
  const assemblyOf = new Map<string, string>();
  if (Array.isArray(document.bodies)) {
    for (const body of document.bodies) {
      if (isJsonObject(body) && typeof body.id === "string" && typeof body.assembly === "string") {
        assemblyOf.set(body.id, body.assembly);
      }
    }
  }
  return assemblyOf;
}

function jointEnds(joint: unknown): { joint: JsonObject; parent: string; child: string } | null {
  if (!isJsonObject(joint) || typeof joint.parent !== "string" || typeof joint.child !== "string") {
    return null;
  }
  return { joint, parent: joint.parent, child: joint.child };
}

function isBetweenAssemblies(parent: string, child: string, assemblyOf: Bodies): boolean {
  const [parentAssembly, childAssembly] = [assemblyOf.get(parent), assemblyOf.get(child)];
  return (
    parentAssembly !== undefined && childAssembly !== undefined && parentAssembly !== childAssembly
  );
}

function migratedJoint(joint: unknown, assemblyOf: Bodies): unknown {
  const ends = jointEnds(joint);
  if (ends === null) {
    return joint;
  }
  const childAssembly = assemblyOf.get(ends.child);
  const child =
    childAssembly !== undefined && isBetweenAssemblies(ends.parent, ends.child, assemblyOf)
      ? { kind: "assembly", key: childAssembly }
      : { kind: "body", id: ends.child };
  return { ...ends.joint, parent: { kind: "body", id: ends.parent }, child };
}

export function migrateV12ToV13(document: JsonObject): JsonObject {
  const assemblyOf = assemblyOfBodies(document);
  const joints = Array.isArray(document.joints)
    ? document.joints.map((joint: unknown) => migratedJoint(joint, assemblyOf))
    : document.joints;
  return { ...document, schema_version: 13, joints };
}

type Link = { parent: string; child: string };

function linksOf(document: JsonObject): Link[] {
  const joints = Array.isArray(document.joints) ? document.joints : [];
  return joints.flatMap((joint: unknown) => {
    const ends = jointEnds(joint);
    return ends === null ? [] : [{ parent: ends.parent, child: ends.child }];
  });
}

// Bodies with no parent joint in an assembly that a joint between assemblies
// anchors: they never moved, and now follow their group.
function jointlessBodiesOfAnchoredAssemblies(links: readonly Link[], assemblyOf: Bodies) {
  const anchored = new Set(
    links.flatMap(({ parent, child }) => {
      const childAssembly = assemblyOf.get(child);
      return childAssembly !== undefined && isBetweenAssemblies(parent, child, assemblyOf)
        ? [childAssembly]
        : [];
    }),
  );
  const withParentJoint = new Set(links.map(({ child }) => child));
  return [...assemblyOf]
    .filter(([id, assembly]) => anchored.has(assembly) && !withParentJoint.has(id))
    .map(([id]) => id);
}

/**
 * The bodies of a version 12 document that behave differently in version 13
 * (ADR 0055 point 9): those with no parent joint in an anchored assembly,
 * which never moved and now follow their assembly, and everything that hangs
 * from them, through body joints or through the assemblies they anchor.
 */
export function bodiesNowFollowingTheirGroup(document: JsonObject): string[] {
  const assemblyOf = assemblyOfBodies(document);
  const links = linksOf(document);
  const changed = new Set(jointlessBodiesOfAnchoredAssemblies(links, assemblyOf));
  let grew = true;
  while (grew) {
    grew = false;
    for (const { parent, child } of links) {
      if (!changed.has(parent)) {
        continue;
      }
      // A joint between assemblies carries the whole assembly it anchors.
      const childAssembly = assemblyOf.get(child);
      const reached = isBetweenAssemblies(parent, child, assemblyOf)
        ? [...assemblyOf].filter(([, assembly]) => assembly === childAssembly).map(([id]) => id)
        : [child];
      for (const id of reached.filter((reachedId) => !changed.has(reachedId))) {
        changed.add(id);
        grew = true;
      }
    }
  }
  return [...assemblyOf.keys()].filter((id) => changed.has(id));
}
