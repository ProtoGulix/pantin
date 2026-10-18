import { type Body, groupEndpoint, type Joint, type PantinDocument } from "@pantin/protocol";
import { addJointToDocument } from "./joint-rules.ts";

const NO_POSITIONS: ReadonlyMap<string, number> = new Map();

// One fixed joint per child assembly of an import, named after the child's
// first body (ADR 0055 point 10): the child is the group of that assembly, the
// parent the group of the assembly of the link's parent body. That body is the
// handle of the parent assembly, or of its first child when the assembly holds
// no direct component, so later sibling groups hang from the first sibling's
// group. A link between two bodies of one assembly makes no
// joint: a body with no parent joint follows its group. The bodies and their
// assemblies must already be in the document. Placements are identity and
// joints fixed, so no displayed position is read.
export function addFixedJoints(
  document: PantinDocument,
  links: readonly { parent: Body; child: Body }[],
): { document: PantinDocument; joints: Joint[] } {
  const joints: Joint[] = [];
  let current = document;
  for (const { parent, child } of links.filter(
    (link) => link.parent.assembly !== link.child.assembly,
  )) {
    // A fixed joint never moves: origin and axis are only there because the
    // schema requires them for every joint.
    const added = addJointToDocument(
      current,
      {
        type: "fixed",
        name: child.name,
        parent: groupEndpoint(parent.assembly),
        child: groupEndpoint(child.assembly),
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      },
      NO_POSITIONS,
    );
    current = added.document;
    joints.push(added.joint);
  }
  return { document: current, joints };
}
