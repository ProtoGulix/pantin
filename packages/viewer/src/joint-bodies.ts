import {
  isBodyEndpoint,
  type Joint,
  type JointEndpoint,
  type PantinDocument,
} from "@pantin/protocol";

// A joint end is a body or a group (ADR 0055). The core sends the pose of
// bodies only, so the viewer reads the posed frame of a group through a body
// that follows it: the first body of the assembly that no joint moves (ADR
// 0055 point 2). A group whose bodies all have a parent joint has no such
// body: its frame is not in the poses, and nothing is drawn for it rather
// than a body that moves inside the group. Joints on a group are listed
// through the group itself (tree-model.ts), never through this stand-in.

type Source = Pick<PantinDocument, "bodies" | "joints">;

/** Assembly key to the body standing for that group; absent: no body follows the group. */
export type GroupRepresentatives = ReadonlyMap<string, string>;

export function groupRepresentatives(document: Source): GroupRepresentatives {
  const moved = new Set(
    document.joints.flatMap((joint) => (joint.child.kind === "body" ? [joint.child.id] : [])),
  );
  const representatives = new Map<string, string>();
  for (const body of document.bodies) {
    if (!moved.has(body.id) && !representatives.has(body.assembly)) {
      representatives.set(body.assembly, body.id);
    }
  }
  return representatives;
}

/** The body drawn for an end; "" for a group with no body that follows it. */
export function endpointBodyId(
  representatives: GroupRepresentatives,
  endpoint: JointEndpoint,
): string {
  return endpoint.kind === "body" ? endpoint.id : (representatives.get(endpoint.key) ?? "");
}

export function jointBodyIds(
  representatives: GroupRepresentatives,
  joint: Pick<Joint, "parent" | "child">,
): { parent: string; child: string } {
  return {
    parent: endpointBodyId(representatives, joint.parent),
    child: endpointBodyId(representatives, joint.child),
  };
}

export type JointEndRole = "parent" | "child";

type Ends = Pick<Joint, "parent" | "child">;

function roleOf(joint: Ends, matches: (endpoint: JointEndpoint) => boolean): JointEndRole | null {
  if (matches(joint.child)) {
    return "child";
  }
  return matches(joint.parent) ? "parent" : null;
}

/**
 * What the body is to the joint by the joint's own ends, never through a
 * group's stand-in; the child wins when both ends are the body.
 */
export function bodyRoleInJoint(joint: Ends, bodyId: string): JointEndRole | null {
  return roleOf(joint, (endpoint) => isBodyEndpoint(endpoint, bodyId));
}

/** What the group (an assembly used as a joint end) is to the joint. */
export function groupRoleInJoint(joint: Ends, assemblyKey: string): JointEndRole | null {
  return roleOf(joint, (endpoint) => endpoint.kind === "assembly" && endpoint.key === assemblyKey);
}
