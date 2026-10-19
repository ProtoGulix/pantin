import {
  groupEndpoint,
  type Joint,
  type JointEndpoint,
  type PantinDocument,
} from "@pantin/protocol";

// The bodies that move rigidly with a joint end (ADR 0055 points 2-3): what
// the viewer tints when a joint is selected. A pure walk over the document
// graph, no kinematics: a body hung through a fixed joint follows its parent,
// a body moved by any other joint does not. An unjointed body is taken to its
// assembly's set even when no joint moves that assembly: the set is then the
// static part it belongs to, which is what the user sees as one piece.

type Source = Pick<PantinDocument, "bodies" | "joints">;

function isGroupAt(endpoint: JointEndpoint, groupKeys: ReadonlySet<string>): boolean {
  return endpoint.kind === "assembly" && groupKeys.has(endpoint.key);
}

// The bodies of a group that no joint moves: they hold the group's frame.
function unmovedBodiesOf(document: Source, assemblyKey: string): string[] {
  const moved = new Set(
    document.joints.flatMap((joint) => (joint.child.kind === "body" ? [joint.child.id] : [])),
  );
  return document.bodies
    .filter((body) => body.assembly === assemblyKey && !moved.has(body.id))
    .map((body) => body.id);
}

function followsParent(joint: Joint, bodyIds: Set<string>, groupKeys: Set<string>): boolean {
  if (joint.type !== "fixed") {
    return false;
  }
  return joint.parent.kind === "body"
    ? bodyIds.has(joint.parent.id)
    : isGroupAt(joint.parent, groupKeys);
}

// Adds what one fixed joint carries along; true when the sets grew.
function carry(document: Source, joint: Joint, bodyIds: Set<string>, groupKeys: Set<string>) {
  if (joint.child.kind === "body") {
    const known = bodyIds.has(joint.child.id);
    bodyIds.add(joint.child.id);
    return !known;
  }
  if (groupKeys.has(joint.child.key)) {
    return false;
  }
  groupKeys.add(joint.child.key);
  for (const bodyId of unmovedBodiesOf(document, joint.child.key)) {
    bodyIds.add(bodyId);
  }
  return true;
}

function sameEndpoint(left: JointEndpoint, right: JointEndpoint): boolean {
  return left.kind === "body"
    ? right.kind === "body" && right.id === left.id
    : right.kind === "assembly" && right.key === left.key;
}

// The top of the rigid link an end belongs to: up through the fixed joint that
// holds it, and from an unjointed body to its group, whose bodies it moves with.
function rigidTop(document: Source, endpoint: JointEndpoint, seen: JointEndpoint[]): JointEndpoint {
  if (seen.some((visited) => sameEndpoint(visited, endpoint))) {
    return endpoint;
  }
  const holder = document.joints.find((joint) => sameEndpoint(joint.child, endpoint));
  if (holder === undefined) {
    const body =
      endpoint.kind === "body" ? document.bodies.find((b) => b.id === endpoint.id) : undefined;
    return body === undefined
      ? endpoint
      : rigidTop(document, groupEndpoint(body.assembly), [...seen, endpoint]);
  }
  return holder.type === "fixed"
    ? rigidTop(document, holder.parent, [...seen, endpoint])
    : endpoint;
}

/** Ids of the bodies that move with this end, the end's own bodies included. */
export function rigidBodyIds(document: Source, endpoint: JointEndpoint): ReadonlySet<string> {
  const top = rigidTop(document, endpoint, []);
  const bodyIds = new Set<string>();
  const groupKeys = new Set<string>();
  if (top.kind === "body") {
    bodyIds.add(top.id);
  } else {
    groupKeys.add(top.key);
    for (const bodyId of unmovedBodiesOf(document, top.key)) {
      bodyIds.add(bodyId);
    }
  }
  // Each pass follows one more link of any fixed chain; it stops at a fixed point.
  let grew = true;
  while (grew) {
    grew = false;
    for (const joint of document.joints) {
      if (followsParent(joint, bodyIds, groupKeys) && carry(document, joint, bodyIds, groupKeys)) {
        grew = true;
      }
    }
  }
  return bodyIds;
}
