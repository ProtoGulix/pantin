import type { Joint, JointEndpoint, PantinDocument } from "@pantin/protocol";

// A joint end is a body or a group (ADR 0055). The viewer draws and lists
// joints through bodies, so a group stands for its root body: the first body
// of the assembly that no joint moves, which follows the group and is the one
// the old anchor joint pointed at before version 13. The group editing of
// ADR 0055 point 12 is a later slice.

type Source = Pick<PantinDocument, "bodies" | "joints">;

/** Assembly key to the body standing for that group; absent: the assembly is empty. */
export type GroupRepresentatives = ReadonlyMap<string, string>;

export function groupRepresentatives(document: Source): GroupRepresentatives {
  const moved = new Set(
    document.joints.flatMap((joint) => (joint.child.kind === "body" ? [joint.child.id] : [])),
  );
  const representatives = new Map<string, string>();
  for (const body of document.bodies) {
    const current = representatives.get(body.assembly);
    // A body moved by a joint only stands for a group with no root body.
    if (current === undefined || (moved.has(current) && !moved.has(body.id))) {
      representatives.set(body.assembly, body.id);
    }
  }
  return representatives;
}

/** The body drawn for an end; "" for an empty group. */
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
