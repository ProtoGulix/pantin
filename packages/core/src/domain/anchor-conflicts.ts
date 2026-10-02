import type { Joint, PantinDocument } from "@pantin/protocol";

// Refusals of ADR 0033 point 2: an assembly with a second anchor, or anchors
// that close a loop. Checked on the document an edit would produce, before
// the schema sees it, so the answer is a `conflict` that names the joint
// already in place instead of a generic invalid_request.

type ConflictSource = Pick<PantinDocument, "assemblies" | "bodies" | "joints">;

// Joints that are not part of the edit come first: the message names the one
// that was already there.
function jointsBetweenAssemblies(
  document: ConflictSource,
  editedJointIds: ReadonlySet<string>,
): { joint: Joint; from: string; to: string }[] {
  const assemblyOf = new Map(document.bodies.map((body) => [body.id, body.assembly]));
  const links: { joint: Joint; from: string; to: string }[] = [];
  for (const joint of document.joints) {
    const from = assemblyOf.get(joint.parent);
    const to = assemblyOf.get(joint.child);
    if (from !== undefined && to !== undefined && from !== to) {
      links.push({ joint, from, to });
    }
  }
  const inPlace = links.filter((link) => !editedJointIds.has(link.joint.id));
  return [...inPlace, ...links.filter((link) => editedJointIds.has(link.joint.id))];
}

export function findAnchorConflict(
  document: ConflictSource,
  editedJointIds: ReadonlySet<string>,
): string | undefined {
  const nameOf = (key: string) => document.assemblies.find((item) => item.key === key)?.name ?? key;
  const anchorOf = new Map<string, { joint: Joint; from: string }>();
  for (const { joint, from, to } of jointsBetweenAssemblies(document, editedJointIds)) {
    const known = anchorOf.get(to);
    if (known !== undefined) {
      return `Assembly "${nameOf(to)}" is already anchored by joint "${known.joint.id}" (to assembly "${nameOf(known.from)}"). Delete or change that joint first.`;
    }
    anchorOf.set(to, { joint, from });
  }
  for (const start of anchorOf.keys()) {
    const path: string[] = [];
    for (let key: string | undefined = start; key !== undefined; key = anchorOf.get(key)?.from) {
      const index = path.indexOf(key);
      if (index >= 0) {
        const loop = path.slice(index).flatMap((member) => {
          const anchor = anchorOf.get(member);
          return anchor === undefined ? [] : [{ assembly: member, ...anchor }];
        });
        return loopMessage(loop, editedJointIds, nameOf);
      }
      path.push(key);
    }
  }
  return undefined;
}

type Anchor = { assembly: string; joint: Joint; from: string };

// Names a joint of the loop that was already there; the edited one only when
// the loop has no other. A loop has at least two members.
function loopMessage(
  loop: readonly Anchor[],
  editedJointIds: ReadonlySet<string>,
  nameOf: (key: string) => string,
): string {
  const inPlace = loop.find((anchor) => !editedJointIds.has(anchor.joint.id)) ?? loop[0];
  if (inPlace === undefined) {
    throw new Error("A loop of anchors cannot be empty.");
  }
  return `These anchors would form a loop: assembly "${nameOf(inPlace.assembly)}" is already anchored by joint "${inPlace.joint.id}" (to assembly "${nameOf(inPlace.from)}"). Delete or change that joint first.`;
}
